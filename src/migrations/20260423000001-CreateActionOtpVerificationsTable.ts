import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateActionOtpVerificationsTable20260423000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle.action_otp_verifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        subscription_id UUID NOT NULL,
        action VARCHAR(32) NOT NULL,
        otp_code VARCHAR(6) NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        sent_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_action_otp_key_active
        ON oracle.action_otp_verifications(user_id, subscription_id, action, used_at);

      CREATE INDEX IF NOT EXISTS idx_action_otp_expires_at
        ON oracle.action_otp_verifications(expires_at);

      CREATE INDEX IF NOT EXISTS idx_action_otp_code_active
        ON oracle.action_otp_verifications(user_id, subscription_id, action, otp_code, used_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS oracle.idx_action_otp_code_active;
      DROP INDEX IF EXISTS oracle.idx_action_otp_expires_at;
      DROP INDEX IF EXISTS oracle.idx_action_otp_key_active;
      DROP TABLE IF EXISTS oracle.action_otp_verifications;
    `);
  }
}