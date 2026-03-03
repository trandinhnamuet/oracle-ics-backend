import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserProfileFields20260303000001 implements MigrationInterface {
  name = 'AddUserProfileFields20260303000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "oracle"."users"
      ADD COLUMN IF NOT EXISTS "gender" VARCHAR(10),
      ADD COLUMN IF NOT EXISTS "id_card" VARCHAR(20),
      ADD COLUMN IF NOT EXISTS "backup_email" VARCHAR(255),
      ADD COLUMN IF NOT EXISTS "address" VARCHAR(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "oracle"."users"
      DROP COLUMN IF EXISTS "gender",
      DROP COLUMN IF EXISTS "id_card",
      DROP COLUMN IF EXISTS "backup_email",
      DROP COLUMN IF EXISTS "address"
    `);
  }
}
