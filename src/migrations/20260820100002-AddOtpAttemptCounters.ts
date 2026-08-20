import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOtpAttemptCounters20260820100002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasEmailAttempts = await queryRunner.hasColumn('oracle.users', 'email_verification_otp_attempts');
    if (!hasEmailAttempts) {
      await queryRunner.query(
        `ALTER TABLE oracle.users ADD COLUMN email_verification_otp_attempts integer NOT NULL DEFAULT 0`,
      );
    }

    const hasResetAttempts = await queryRunner.hasColumn('oracle.users', 'password_reset_otp_attempts');
    if (!hasResetAttempts) {
      await queryRunner.query(
        `ALTER TABLE oracle.users ADD COLUMN password_reset_otp_attempts integer NOT NULL DEFAULT 0`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE oracle.users DROP COLUMN IF EXISTS password_reset_otp_attempts`);
    await queryRunner.query(`ALTER TABLE oracle.users DROP COLUMN IF EXISTS email_verification_otp_attempts`);
  }
}
