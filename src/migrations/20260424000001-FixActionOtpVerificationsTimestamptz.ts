import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fix action_otp_verifications table: convert TIMESTAMP columns to TIMESTAMPTZ.
 *
 * The table was created with TIMESTAMP (no timezone) columns AFTER the
 * ConvertOracleTimestampsToUtc migration ran, so those columns were not
 * automatically converted. This caused a timezone mismatch: PostgreSQL server
 * runs in UTC+7 but Node.js server runs in UTC, making stored sentAt appear
 * ~7 hours in the future when read back, triggering a bogus 24000-second cooldown.
 *
 * With TIMESTAMPTZ, PostgreSQL stores and returns values in UTC regardless of
 * session timezone, eliminating the mismatch.
 *
 * Existing rows have sentAt/expiresAt stored as UTC+7 local strings (e.g.
 * "2025-01-15 17:00:00" meaning actual UTC 10:00:00). The USING clause
 * re-interprets them as Asia/Ho_Chi_Minh time to get the correct UTC value.
 */
export class FixActionOtpVerificationsTimestamptz20260424000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.action_otp_verifications
        ALTER COLUMN expires_at TYPE TIMESTAMPTZ
          USING expires_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
        ALTER COLUMN used_at TYPE TIMESTAMPTZ
          USING used_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
        ALTER COLUMN sent_at TYPE TIMESTAMPTZ
          USING sent_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
        ALTER COLUMN created_at TYPE TIMESTAMPTZ
          USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh',
        ALTER COLUMN updated_at TYPE TIMESTAMPTZ
          USING updated_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.action_otp_verifications
        ALTER COLUMN expires_at TYPE TIMESTAMP USING expires_at AT TIME ZONE 'UTC',
        ALTER COLUMN used_at TYPE TIMESTAMP USING used_at AT TIME ZONE 'UTC',
        ALTER COLUMN sent_at TYPE TIMESTAMP USING sent_at AT TIME ZONE 'UTC',
        ALTER COLUMN created_at TYPE TIMESTAMP USING created_at AT TIME ZONE 'UTC',
        ALTER COLUMN updated_at TYPE TIMESTAMP USING updated_at AT TIME ZONE 'UTC';
    `);
  }
}
