import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Convert all TIMESTAMP (without timezone) columns in schema oracle to TIMESTAMPTZ.
 * Existing values are interpreted as Asia/Ho_Chi_Minh local time and converted to UTC.
 */
export class ConvertOracleTimestampsToUtc20260327110000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE
        rec RECORD;
      BEGIN
        FOR rec IN
          SELECT table_schema, table_name, column_name
          FROM information_schema.columns
          WHERE table_schema = 'oracle'
            AND data_type = 'timestamp without time zone'
        LOOP
          EXECUTE format(
            'ALTER TABLE %I.%I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE ''Asia/Ho_Chi_Minh''',
            rec.table_schema,
            rec.table_name,
            rec.column_name,
            rec.column_name
          );
        END LOOP;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // This migration is intentionally irreversible because we cannot reliably
    // distinguish columns converted by this migration from columns that were
    // already TIMESTAMPTZ before it ran.
    await queryRunner.query('SELECT 1');
  }
}
