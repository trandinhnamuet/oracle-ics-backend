import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Auth-F1: `is_active` conflated two meanings — "email verified" and "admin-enabled".
 * A banned user (is_active=false) could self-unban through the password-login
 * re-verification path (login reissued an OTP, verify-otp set is_active=true). Add an
 * explicit `disabled_at` so an admin ban is distinguishable from a never-verified
 * account and cannot be lifted by the user's own email verification.
 */
export class AddUserDisabledAt20260823100001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const has = await queryRunner.hasColumn('oracle.users', 'disabled_at');
    if (!has) {
      await queryRunner.query(`ALTER TABLE oracle.users ADD COLUMN disabled_at timestamp NULL`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE oracle.users DROP COLUMN IF EXISTS disabled_at`);
  }
}
