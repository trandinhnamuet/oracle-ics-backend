import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVmStartedAtColumn20260109000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances
      ADD COLUMN IF NOT EXISTS vm_started_at TIMESTAMP NULL;
      
      COMMENT ON COLUMN oracle.vm_instances.vm_started_at IS 'Timestamp when the VM was started (useful for uptime calculation)';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances
      DROP COLUMN IF EXISTS vm_started_at;
    `);
  }
}
