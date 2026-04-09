import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Add compartment_id to bandwidth_monthly_snapshots so we can track
 * which compartment a snapshot belongs to even after the vm_instances
 * record has been deleted (i.e. the VM was removed from our DB).
 *
 * This is the prerequisite for showing bandwidth of deleted VMs per compartment.
 */
export class AddCompartmentIdToBandwidthSnapshots20260409000001
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add the new column (nullable — old rows won't have it yet)
    await queryRunner.query(`
      ALTER TABLE oracle.bandwidth_monthly_snapshots
      ADD COLUMN IF NOT EXISTS compartment_id VARCHAR(500)
    `);

    // 2. Backfill compartment_id for existing snapshots that still have a
    //    matching vm_instance_id → join with vm_instances to get the value.
    await queryRunner.query(`
      UPDATE oracle.bandwidth_monthly_snapshots bms
      SET compartment_id = vi.compartment_id
      FROM oracle.vm_instances vi
      WHERE bms.vm_instance_id = vi.id
        AND bms.compartment_id IS NULL
    `);

    // 3. Index for the query pattern used in getAllVmsBandwidthUsage:
    //    WHERE year_month = X AND compartment_id = Y
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_bandwidth_snapshots_compartment_month"
        ON oracle.bandwidth_monthly_snapshots (compartment_id, year_month)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS oracle."IDX_bandwidth_snapshots_compartment_month"
    `);
    await queryRunner.query(`
      ALTER TABLE oracle.bandwidth_monthly_snapshots
      DROP COLUMN IF EXISTS compartment_id
    `);
  }
}
