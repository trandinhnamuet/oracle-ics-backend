import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateImagesTable1728220000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'images',
        schema: 'public',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'filename',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'original_name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'mime_type',
            type: 'varchar',
            length: '100',
            isNullable: false,
          },
          {
            name: 'size',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'path',
            type: 'varchar',
            length: '500',
            isNullable: false,
          },
          {
            name: 'url',
            type: 'varchar',
            length: '500',
            isNullable: false,
          },
          {
            name: 'uploaded_by',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP',
          },
        ],
        indices: [
          {
            name: 'IDX_IMAGES_UPLOADED_BY',
            columnNames: ['uploaded_by'],
          },
          {
            name: 'IDX_IMAGES_FILENAME',
            columnNames: ['filename'],
          },
        ],
      }),
      true,
    );

    // Add foreign key constraint
    await queryRunner.query(`
      ALTER TABLE public.images 
      ADD CONSTRAINT FK_IMAGES_UPLOADED_BY 
      FOREIGN KEY (uploaded_by) REFERENCES public.users(id) 
      ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('public.images');
  }
}