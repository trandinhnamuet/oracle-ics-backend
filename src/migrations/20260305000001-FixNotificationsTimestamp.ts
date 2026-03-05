import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixNotificationsTimestamp20260305000001 implements MigrationInterface {
  name = 'FixNotificationsTimestamp20260305000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Change created_at from timestamp without timezone to timestamptz (UTC-aware).
    // PostgreSQL treats the existing values as UTC during the cast, so no data is lost.
    await queryRunner.query(`
      ALTER TABLE "oracle"."notifications"
      ALTER COLUMN "created_at" TYPE timestamptz
      USING "created_at" AT TIME ZONE 'UTC'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "oracle"."notifications"
      ALTER COLUMN "created_at" TYPE timestamp without time zone
      USING "created_at" AT TIME ZONE 'UTC'
    `);
  }
}
