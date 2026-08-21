import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVmWinrmAdminPassword20260821100001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('oracle.vm_instances', 'winrm_admin_password');
    if (!hasColumn) {
      await queryRunner.query(
        `ALTER TABLE oracle.vm_instances ADD COLUMN winrm_admin_password text`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE oracle.vm_instances DROP COLUMN IF EXISTS winrm_admin_password`);
  }
}
