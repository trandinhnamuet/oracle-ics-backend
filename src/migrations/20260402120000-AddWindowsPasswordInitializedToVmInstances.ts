import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWindowsPasswordInitializedToVmInstances20260402120000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances
        ADD COLUMN IF NOT EXISTS windows_password_initialized BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    await queryRunner.query(`
      COMMENT ON COLUMN oracle.vm_instances.windows_password_initialized IS
        'TRUE after at least one successful password reset via API. FALSE means initial password may still be active (must-change flag may be set, WinRM NTLM will likely fail).';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances
        DROP COLUMN IF EXISTS windows_password_initialized;
    `);
  }
}
