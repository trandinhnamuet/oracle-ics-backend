import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEnglishFieldsToNotifications20260311000001 implements MigrationInterface {
  name = 'AddEnglishFieldsToNotifications20260311000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.notifications
        ADD COLUMN IF NOT EXISTS title_en VARCHAR(255),
        ADD COLUMN IF NOT EXISTS message_en TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.notifications
        DROP COLUMN IF EXISTS title_en,
        DROP COLUMN IF EXISTS message_en
    `);
  }
}
