import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPasswordResetFields20260109000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add columns với IF NOT EXISTS để an toàn khi chạy lại
    await queryRunner.query(`ALTER TABLE oracle.users ADD COLUMN IF NOT EXISTS password_reset_otp VARCHAR(6)`);
    await queryRunner.query(`ALTER TABLE oracle.users ADD COLUMN IF NOT EXISTS password_reset_otp_expires_at TIMESTAMP`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop password_reset_otp_expires_at column
    await queryRunner.dropColumn('oracle.users', 'password_reset_otp_expires_at');

    // Drop password_reset_otp column
    await queryRunner.dropColumn('oracle.users', 'password_reset_otp');
  }
}
