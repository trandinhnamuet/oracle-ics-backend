import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailVerificationFields20260109000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Change is_active default to false
    await queryRunner.query(`ALTER TABLE oracle.users ALTER COLUMN is_active SET DEFAULT false`);

    // Add columns với IF NOT EXISTS để an toàn khi chạy lại
    await queryRunner.query(`ALTER TABLE oracle.users ADD COLUMN IF NOT EXISTS email_verification_otp VARCHAR(6)`);
    await queryRunner.query(`ALTER TABLE oracle.users ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove columns
    await queryRunner.dropColumn('oracle.users', 'otp_expires_at');
    await queryRunner.dropColumn('oracle.users', 'email_verification_otp');

    // Revert is_active default to true
    await queryRunner.query(`
      ALTER TABLE oracle.users 
      ALTER COLUMN is_active SET DEFAULT true
    `);
  }
}
