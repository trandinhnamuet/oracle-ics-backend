import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOperatingSystemVersionToVmInstances20260327123000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances
      ADD COLUMN IF NOT EXISTS operating_system_version VARCHAR(100);
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN oracle.vm_instances.operating_system_version
      IS 'Operating system version from OCI image metadata';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances
      DROP COLUMN IF EXISTS operating_system_version;
    `);
  }
}
