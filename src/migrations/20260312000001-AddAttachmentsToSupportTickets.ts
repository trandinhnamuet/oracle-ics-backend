import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttachmentsToSupportTickets20260312000001 implements MigrationInterface {
  name = 'AddAttachmentsToSupportTickets20260312000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Change attachment_url from varchar(500) to text so it can hold longer JSON arrays
    await queryRunner.query(`
      ALTER TABLE oracle.support_tickets
        ALTER COLUMN attachment_url TYPE TEXT
    `);

    // Add new attachments column to store JSON array of file objects
    await queryRunner.query(`
      ALTER TABLE oracle.support_tickets
        ADD COLUMN IF NOT EXISTS attachments TEXT
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.support_tickets
        DROP COLUMN IF EXISTS attachments
    `);
    await queryRunner.query(`
      ALTER TABLE oracle.support_tickets
        ALTER COLUMN attachment_url TYPE VARCHAR(500)
    `);
  }
}
