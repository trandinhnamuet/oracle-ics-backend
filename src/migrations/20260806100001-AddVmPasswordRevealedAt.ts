import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tracks the one-time reveal of a Windows VM's initial password.
 *
 * The initial password is no longer returned by the VM detail API; the owner
 * retrieves it exactly once, after which the stored value is cleared and this
 * timestamp records that the reveal already happened.
 */
export class AddVmPasswordRevealedAt20260806100001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances
        ADD COLUMN IF NOT EXISTS windows_initial_password_revealed_at timestamp with time zone
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances
        DROP COLUMN IF EXISTS windows_initial_password_revealed_at
    `);
  }
}
