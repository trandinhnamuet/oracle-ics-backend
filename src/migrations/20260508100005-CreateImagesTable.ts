import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateImagesTable20260508100005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.images');
    if (tableExists) { console.log('Table oracle.images already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.images (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        filename character varying(255) NOT NULL,
        original_name character varying(255) NOT NULL,
        mime_type character varying(100) NOT NULL,
        size integer NOT NULL,
        path character varying(500) NOT NULL,
        url character varying(500) NOT NULL,
        uploaded_by integer,
        created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT "PK_1fe148074c6a1a91b63cb9ee3c9" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_IMAGES_FILENAME" ON oracle.images (filename)`);
    await queryRunner.query(`CREATE INDEX "IDX_IMAGES_UPLOADED_BY" ON oracle.images (uploaded_by)`);

    await queryRunner.query(`
      ALTER TABLE oracle.images
        ADD CONSTRAINT fk_images_uploaded_by
        FOREIGN KEY (uploaded_by) REFERENCES oracle.users(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.images CASCADE`);
  }
}
