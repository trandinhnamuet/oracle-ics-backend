import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmailVerificationsTable20251125000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle.email_verifications (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        otp_code VARCHAR(6) NOT NULL,
        attempt_count INTEGER DEFAULT 0,
        expires_at TIMESTAMP NOT NULL,
        last_resend_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      
      CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON oracle.email_verifications(email);
      CREATE INDEX IF NOT EXISTS idx_email_verifications_expires_at ON oracle.email_verifications(expires_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS oracle.idx_email_verifications_expires_at;
      DROP INDEX IF EXISTS oracle.idx_email_verifications_email;
      DROP TABLE IF EXISTS oracle.email_verifications;
    `);
  }
}