import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm'

export class CreatePageAnalyticsTable1705619200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'page_analytics',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'gen_random_uuid()',
          },
          {
            name: 'user_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'event_type',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'page_path',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'page_title',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'page_location',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'user_agent',
            type: 'text',
            isNullable: true,
          },
          {
            name: 'button_name',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'button_label',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'form_name',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'load_time_ms',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'scroll_percent',
            type: 'integer',
            isNullable: true,
          },
          {
            name: 'additional_params',
            type: 'jsonb',
            isNullable: true,
          },
          {
            name: 'session_id',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'country',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'city',
            type: 'varchar',
            isNullable: true,
          },
          {
            name: 'created_at',
            type: 'timestamp with time zone',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp with time zone',
            isNullable: true,
          },
        ],
      }),
      true,
    )

    // Create indexes for better query performance
    await queryRunner.createIndex(
      'page_analytics',
      new TableIndex({
        name: 'IDX_analytics_event_type_created_at',
        columnNames: ['event_type', 'created_at'],
      }),
    )

    await queryRunner.createIndex(
      'page_analytics',
      new TableIndex({
        name: 'IDX_analytics_page_path_created_at',
        columnNames: ['page_path', 'created_at'],
      }),
    )

    await queryRunner.createIndex(
      'page_analytics',
      new TableIndex({
        name: 'IDX_analytics_user_id_created_at',
        columnNames: ['user_id', 'created_at'],
      }),
    )

    await queryRunner.createIndex(
      'page_analytics',
      new TableIndex({
        name: 'IDX_analytics_created_at',
        columnNames: ['created_at'],
      }),
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('page_analytics')
  }
}
