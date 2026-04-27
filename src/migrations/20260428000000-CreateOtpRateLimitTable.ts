import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOtpRateLimitTable20260428000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle.otp_rate_limit (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_otp_rate_limit_email_sent
        ON oracle.otp_rate_limit(email, sent_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS oracle.idx_otp_rate_limit_email_sent;
      DROP TABLE IF EXISTS oracle.otp_rate_limit;
    `);
  }
}
