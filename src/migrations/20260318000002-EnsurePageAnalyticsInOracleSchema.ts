import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * This migration ensures oracle.page_analytics exists on the production server.
 * The original CreatePageAnalyticsTable migration (20260119000000) was already
 * recorded as "DONE" in typeorm_migrations when the table was being created in
 * public schema. After we updated it to use oracle schema, TypeORM skips it
 * because it's already marked as completed.
 * This migration uses CREATE TABLE IF NOT EXISTS to safely ensure the table exists.
 */
export class EnsurePageAnalyticsInOracleSchema20260318000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle.page_analytics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR,
        event_type VARCHAR NOT NULL,
        page_path VARCHAR,
        page_title VARCHAR,
        page_location VARCHAR,
        user_agent TEXT,
        button_name VARCHAR,
        button_label VARCHAR,
        form_name VARCHAR,
        load_time_ms INTEGER,
        scroll_percent INTEGER,
        additional_params JSONB,
        session_id VARCHAR,
        country VARCHAR,
        city VARCHAR,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
        updated_at TIMESTAMP WITH TIME ZONE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_analytics_event_type_created_at"
        ON oracle.page_analytics (event_type, created_at);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_analytics_page_path_created_at"
        ON oracle.page_analytics (page_path, created_at);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_analytics_user_id_created_at"
        ON oracle.page_analytics (user_id, created_at);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_analytics_created_at"
        ON oracle.page_analytics (created_at);
    `);

    console.log('✅ oracle.page_analytics ensured in oracle schema');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('oracle.page_analytics', true);
  }
}
