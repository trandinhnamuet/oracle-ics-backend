import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBilingualFieldsToTermsSections20260318020000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.terms_sections
      ADD COLUMN IF NOT EXISTS title_vi VARCHAR(500),
      ADD COLUMN IF NOT EXISTS title_en VARCHAR(500),
      ADD COLUMN IF NOT EXISTS articles_vi JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS articles_en JSONB DEFAULT '[]'::jsonb;
    `);

    await queryRunner.query(`
      UPDATE oracle.terms_sections
      SET
        title_vi = COALESCE(title_vi, title),
        title_en = COALESCE(title_en, title),
        articles_vi = COALESCE(articles_vi, articles),
        articles_en = COALESCE(articles_en, articles)
      WHERE
        title_vi IS NULL
        OR title_en IS NULL
        OR articles_vi IS NULL
        OR articles_en IS NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.terms_sections
      ALTER COLUMN title_vi SET NOT NULL,
      ALTER COLUMN title_en SET NOT NULL,
      ALTER COLUMN articles_vi SET NOT NULL,
      ALTER COLUMN articles_en SET NOT NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.terms_sections
      DROP COLUMN IF EXISTS title,
      DROP COLUMN IF EXISTS articles;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.terms_sections
      ADD COLUMN IF NOT EXISTS title VARCHAR(500),
      ADD COLUMN IF NOT EXISTS articles JSONB DEFAULT '[]'::jsonb;
    `);

    await queryRunner.query(`
      UPDATE oracle.terms_sections
      SET
        title = COALESCE(title, title_vi),
        articles = COALESCE(articles, articles_vi)
      WHERE title IS NULL OR articles IS NULL;
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.terms_sections
      DROP COLUMN IF EXISTS title_vi,
      DROP COLUMN IF EXISTS title_en,
      DROP COLUMN IF EXISTS articles_vi,
      DROP COLUMN IF EXISTS articles_en;
    `);
  }
}
