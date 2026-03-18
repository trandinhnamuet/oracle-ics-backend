import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * This migration ensures oracle.user_sessions exists.
 * The original CreateUserSessions migration (20260115125556) had schema issues
 * and may already be recorded as "done" in typeorm_migrations with the table
 * created in public schema instead of oracle schema.
 * This migration safely creates the table in oracle schema if it does not exist.
 */
export class EnsureUserSessionsInOracleSchema20260318000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle.user_sessions (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "userId" VARCHAR NOT NULL,
        "refreshTokenHash" TEXT NOT NULL,
        "userAgent" VARCHAR(500),
        "ipAddress" VARCHAR(100),
        "expiresAt" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_sessions_userId"
        ON oracle.user_sessions ("userId");
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expiresAt"
        ON oracle.user_sessions ("expiresAt");
    `);

    console.log('✅ oracle.user_sessions ensured in oracle schema');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('oracle.user_sessions', true);
  }
}
