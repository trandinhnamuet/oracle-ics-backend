import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recreates the bandwidth tracking system:
 * 1. Drops the old inaccurate bandwidth_logs table
 * 2. Creates bandwidth_monthly_snapshots (one row per VM per month)
 * 3. Adds vnic_id column to vm_instances for OCI oci_vcn metric queries
 */
export class RecreateBandwidthSystem20260316000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Drop old table (data was double-counted and used wrong metric unit)
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.bandwidth_logs CASCADE`);
    console.log('✅ Dropped legacy oracle.bandwidth_logs table');

    // Step 2: Create new monthly snapshot table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle.bandwidth_monthly_snapshots (
        id               SERIAL PRIMARY KEY,
        vm_instance_id   INTEGER NULL,
        instance_id      VARCHAR(500) NOT NULL,
        instance_name    VARCHAR(255) NOT NULL,
        user_id          INTEGER NOT NULL,
        subscription_id  UUID NULL,
        year_month       CHAR(7) NOT NULL,
        bytes_out_total  NUMERIC(20, 0) DEFAULT 0,
        bytes_in_total   NUMERIC(20, 0) DEFAULT 0,
        data_source      VARCHAR(20) DEFAULT 'oci',
        recorded_at      TIMESTAMP DEFAULT NOW(),
        CONSTRAINT uq_bw_snapshot_vm_month UNIQUE (instance_id, year_month)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bw_snapshot_instance_month
      ON oracle.bandwidth_monthly_snapshots(instance_id, year_month)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bw_snapshot_user_month
      ON oracle.bandwidth_monthly_snapshots(user_id, year_month)
    `);

    console.log('✅ Created oracle.bandwidth_monthly_snapshots table');

    // Step 3: Add vnic_id to vm_instances (cache for oci_vcn metric queries)
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances
      ADD COLUMN IF NOT EXISTS vnic_id VARCHAR(500) NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_vm_instances_vnic_id
      ON oracle.vm_instances(vnic_id) WHERE vnic_id IS NOT NULL
    `);

    console.log('✅ Added vnic_id column to oracle.vm_instances');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS oracle.idx_vm_instances_vnic_id`);
    await queryRunner.query(`ALTER TABLE oracle.vm_instances DROP COLUMN IF EXISTS vnic_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS oracle.idx_bw_snapshot_user_month`);
    await queryRunner.query(`DROP INDEX IF EXISTS oracle.idx_bw_snapshot_instance_month`);
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.bandwidth_monthly_snapshots CASCADE`);
    console.log('✅ Bandwidth system reverted');
  }
}
