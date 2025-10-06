import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvatarUrlToUsers1728220000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.users 
      ADD COLUMN avatar_url VARCHAR(500) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.users 
      DROP COLUMN avatar_url
    `);
  }
}