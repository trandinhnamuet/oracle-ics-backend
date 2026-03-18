import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTermsSectionsTable20260318010000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS oracle;`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle.terms_sections (
        id SERIAL PRIMARY KEY,
        title_vi VARCHAR(500) NOT NULL,
        title_en VARCHAR(500) NOT NULL,
        order_index INT NOT NULL DEFAULT 0,
        articles_vi JSONB NOT NULL DEFAULT '[]'::jsonb,
        articles_en JSONB NOT NULL DEFAULT '[]'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT true,
        updated_by INT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.terms_sections
      ADD COLUMN IF NOT EXISTS title_vi VARCHAR(500),
      ADD COLUMN IF NOT EXISTS title_en VARCHAR(500),
      ADD COLUMN IF NOT EXISTS articles_vi JSONB,
      ADD COLUMN IF NOT EXISTS articles_en JSONB;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'oracle'
            AND table_name = 'terms_sections'
            AND column_name = 'title'
        ) THEN
          UPDATE oracle.terms_sections
          SET
            title_vi = COALESCE(title_vi, title, ''),
            title_en = COALESCE(title_en, title, ''),
            articles_vi = COALESCE(articles_vi, articles, '[]'::jsonb),
            articles_en = COALESCE(articles_en, articles, '[]'::jsonb)
          WHERE
            title_vi IS NULL OR title_en IS NULL OR articles_vi IS NULL OR articles_en IS NULL;
        ELSE
          UPDATE oracle.terms_sections
          SET
            title_vi = COALESCE(title_vi, ''),
            title_en = COALESCE(title_en, ''),
            articles_vi = COALESCE(articles_vi, '[]'::jsonb),
            articles_en = COALESCE(articles_en, '[]'::jsonb)
          WHERE
            title_vi IS NULL OR title_en IS NULL OR articles_vi IS NULL OR articles_en IS NULL;
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.terms_sections
      ALTER COLUMN title_vi SET NOT NULL,
      ALTER COLUMN title_en SET NOT NULL,
      ALTER COLUMN articles_vi SET NOT NULL,
      ALTER COLUMN articles_en SET NOT NULL,
      ALTER COLUMN articles_vi SET DEFAULT '[]'::jsonb,
      ALTER COLUMN articles_en SET DEFAULT '[]'::jsonb;
    `);

    await queryRunner.query(`ALTER TABLE oracle.terms_sections DROP COLUMN IF EXISTS title;`);
    await queryRunner.query(`ALTER TABLE oracle.terms_sections DROP COLUMN IF EXISTS articles;`);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_terms_sections_order
      ON oracle.terms_sections(order_index);
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_terms_sections_active
      ON oracle.terms_sections(is_active);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.terms_sections
      ADD COLUMN IF NOT EXISTS title VARCHAR(500),
      ADD COLUMN IF NOT EXISTS articles JSONB;
    `);

    await queryRunner.query(`
      UPDATE oracle.terms_sections
      SET
        title = COALESCE(title, title_vi),
        articles = COALESCE(articles, articles_vi);
    `);

    await queryRunner.query(`ALTER TABLE oracle.terms_sections DROP COLUMN IF EXISTS title_vi;`);
    await queryRunner.query(`ALTER TABLE oracle.terms_sections DROP COLUMN IF EXISTS title_en;`);
    await queryRunner.query(`ALTER TABLE oracle.terms_sections DROP COLUMN IF EXISTS articles_vi;`);
    await queryRunner.query(`ALTER TABLE oracle.terms_sections DROP COLUMN IF EXISTS articles_en;`);

    await queryRunner.query('DROP TABLE IF EXISTS oracle.terms_sections;');
  }
}
