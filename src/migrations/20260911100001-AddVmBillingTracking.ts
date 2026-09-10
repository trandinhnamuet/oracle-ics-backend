import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Billing-side tracking for what Oracle actually charges ICS per VM.
 *
 * Motivation: the admin back-office can show what customers PAID (wallets,
 * subscriptions) but has no view of what ICS OWES Oracle at month end. A
 * customer who buys a package on the 1st and cancels on the 15th has paid a
 * full month while Oracle only bills ICS for ~half — the difference is margin
 * that today is invisible. Reconstructing Oracle's bill needs, per VM:
 *
 *   1. WHEN the instance stopped existing (boot volume / storage billing ends).
 *      `terminated_at` — set automatically by a trigger the first time
 *      lifecycle_state becomes TERMINATING/TERMINATED, whichever code path did
 *      it (customer TERMINATE action, subscription cancel, hourly sweep, OCI
 *      404 reconciliation...). A trigger is used on purpose: there are ~8 call
 *      sites that write lifecycle_state and a column set in one place cannot be
 *      forgotten by the next one.
 *
 *   2. HOW LONG it was running vs stopped (OCPU/RAM/Windows-license billing
 *      only accrues while RUNNING; a STOPPED instance still bills its boot
 *      volume). `vm_state_history` records every distinct lifecycle_state
 *      transition, again via trigger so it captures OCI-poll refreshes too.
 *
 *   3. WHAT was provisioned — OCPU count, memory, burstable baseline and boot
 *      volume size — cached on vm_instances so cost can be computed for
 *      terminated instances after OCI no longer returns them. Filled at launch
 *      and lazily re-synced from OCI for live instances (see OciCostService).
 *
 * Backfill: existing terminated VMs get terminated_at from their TERMINATE
 * action log (falling back to updated_at, which is bumped when the state is
 * written). State history is seeded from vm_actions_log START/STOP/TERMINATE
 * and reconciled with the current lifecycle_state so months before this
 * migration are still approximated rather than blank.
 */
export class AddVmBillingTracking20260911100001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Cached shape / billing columns ──────────────────────────────────
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances
        ADD COLUMN IF NOT EXISTS terminated_at             timestamp     NULL,
        ADD COLUMN IF NOT EXISTS ocpus                     numeric(8,2)  NULL,
        ADD COLUMN IF NOT EXISTS memory_gbs                numeric(10,2) NULL,
        ADD COLUMN IF NOT EXISTS boot_volume_gbs           integer       NULL,
        ADD COLUMN IF NOT EXISTS boot_volume_vpus_per_gb   integer       NULL,
        ADD COLUMN IF NOT EXISTS baseline_ocpu_utilization varchar(20)   NULL,
        ADD COLUMN IF NOT EXISTS shape_config_synced_at    timestamp     NULL
    `);

    // ── 2. State history table ────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle.vm_state_history (
        id              serial PRIMARY KEY,
        vm_instance_id  integer      NOT NULL,
        old_state       varchar(50)  NULL,
        new_state       varchar(50)  NOT NULL,
        changed_at      timestamp    NOT NULL DEFAULT (now() AT TIME ZONE 'UTC'),
        source          varchar(20)  NOT NULL DEFAULT 'trigger'
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_vm_state_history_vm_changed
        ON oracle.vm_state_history (vm_instance_id, changed_at)
    `);

    // ── 3. Triggers ───────────────────────────────────────────────────────
    // BEFORE UPDATE: stamp terminated_at the first time the VM enters a
    // terminal state. Never overwritten afterwards, never cleared.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION oracle.fn_vm_instances_stamp_terminated()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.lifecycle_state IN ('TERMINATING', 'TERMINATED')
           AND NEW.terminated_at IS NULL THEN
          NEW.terminated_at := (now() AT TIME ZONE 'UTC');
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_vm_instances_stamp_terminated ON oracle.vm_instances
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_vm_instances_stamp_terminated
        BEFORE INSERT OR UPDATE OF lifecycle_state ON oracle.vm_instances
        FOR EACH ROW EXECUTE FUNCTION oracle.fn_vm_instances_stamp_terminated()
    `);

    // AFTER INSERT / UPDATE: append a history row on every distinct transition.
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION oracle.fn_vm_instances_track_state()
      RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'INSERT' THEN
          IF NEW.lifecycle_state IS NOT NULL THEN
            INSERT INTO oracle.vm_state_history (vm_instance_id, old_state, new_state, changed_at, source)
            VALUES (NEW.id, NULL, NEW.lifecycle_state, COALESCE(NEW.created_at, (now() AT TIME ZONE 'UTC')), 'trigger');
          END IF;
        ELSIF NEW.lifecycle_state IS DISTINCT FROM OLD.lifecycle_state THEN
          INSERT INTO oracle.vm_state_history (vm_instance_id, old_state, new_state, changed_at, source)
          VALUES (NEW.id, OLD.lifecycle_state, NEW.lifecycle_state, (now() AT TIME ZONE 'UTC'), 'trigger');
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS trg_vm_instances_track_state ON oracle.vm_instances
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_vm_instances_track_state
        AFTER INSERT OR UPDATE OF lifecycle_state ON oracle.vm_instances
        FOR EACH ROW EXECUTE FUNCTION oracle.fn_vm_instances_track_state()
    `);

    // ── 4. Backfill terminated_at ─────────────────────────────────────────
    await queryRunner.query(`
      UPDATE oracle.vm_instances vi
      SET terminated_at = COALESCE(
        (SELECT MAX(l.created_at)
           FROM oracle.vm_actions_log l
          WHERE l.vm_instance_id = vi.id
            AND l.action = 'TERMINATE'
            AND COALESCE(l.description, '') NOT LIKE 'VM action failed%'),
        vi.updated_at,
        (now() AT TIME ZONE 'UTC')
      )
      WHERE vi.lifecycle_state IN ('TERMINATING', 'TERMINATED')
        AND vi.terminated_at IS NULL
    `);

    // ── 5. Backfill state history ─────────────────────────────────────────
    // a) one opening row per VM at creation (assume it came up RUNNING — the
    //    provisioning window is a couple of minutes and is billed anyway).
    await queryRunner.query(`
      INSERT INTO oracle.vm_state_history (vm_instance_id, old_state, new_state, changed_at, source)
      SELECT vi.id, NULL, 'RUNNING', vi.created_at, 'backfill'
      FROM oracle.vm_instances vi
      WHERE vi.instance_id IS NOT NULL AND vi.instance_id <> 'PENDING'
        AND NOT EXISTS (SELECT 1 FROM oracle.vm_state_history h WHERE h.vm_instance_id = vi.id)
    `);
    // b) successful START / STOP / TERMINATE actions from the action log.
    await queryRunner.query(`
      INSERT INTO oracle.vm_state_history (vm_instance_id, old_state, new_state, changed_at, source)
      SELECT l.vm_instance_id, NULL,
             CASE l.action WHEN 'START' THEN 'RUNNING'
                           WHEN 'STOP' THEN 'STOPPED'
                           WHEN 'TERMINATE' THEN 'TERMINATED' END,
             l.created_at, 'backfill'
      FROM oracle.vm_actions_log l
      JOIN oracle.vm_instances vi ON vi.id = l.vm_instance_id
      WHERE l.action IN ('START', 'STOP', 'TERMINATE')
        AND COALESCE(l.description, '') NOT LIKE 'VM action failed%'
        AND NOT EXISTS (
          SELECT 1 FROM oracle.vm_state_history h
           WHERE h.vm_instance_id = l.vm_instance_id AND h.changed_at = l.created_at
        )
    `);
    // c) reconcile with the current state: if the latest history row disagrees
    //    with lifecycle_state (sweep stops, OCI refreshes, cancel path...) append
    //    a closing row at terminated_at / updated_at.
    await queryRunner.query(`
      INSERT INTO oracle.vm_state_history (vm_instance_id, old_state, new_state, changed_at, source)
      SELECT vi.id, last.new_state, vi.lifecycle_state,
             GREATEST(
               COALESCE(CASE WHEN vi.lifecycle_state IN ('TERMINATING','TERMINATED') THEN vi.terminated_at END, vi.updated_at, (now() AT TIME ZONE 'UTC')),
               last.changed_at
             ),
             'backfill'
      FROM oracle.vm_instances vi
      JOIN LATERAL (
        SELECT h.new_state, h.changed_at
          FROM oracle.vm_state_history h
         WHERE h.vm_instance_id = vi.id
         ORDER BY h.changed_at DESC, h.id DESC
         LIMIT 1
      ) last ON TRUE
      WHERE vi.instance_id IS NOT NULL AND vi.instance_id <> 'PENDING'
        AND vi.lifecycle_state IS NOT NULL
        AND last.new_state IS DISTINCT FROM vi.lifecycle_state
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_vm_instances_track_state ON oracle.vm_instances`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_vm_instances_stamp_terminated ON oracle.vm_instances`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS oracle.fn_vm_instances_track_state()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS oracle.fn_vm_instances_stamp_terminated()`);
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.vm_state_history`);
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances
        DROP COLUMN IF EXISTS terminated_at,
        DROP COLUMN IF EXISTS ocpus,
        DROP COLUMN IF EXISTS memory_gbs,
        DROP COLUMN IF EXISTS boot_volume_gbs,
        DROP COLUMN IF EXISTS boot_volume_vpus_per_gb,
        DROP COLUMN IF EXISTS baseline_ocpu_utilization,
        DROP COLUMN IF EXISTS shape_config_synced_at
    `);
  }
}
