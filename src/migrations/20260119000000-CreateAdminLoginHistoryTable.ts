import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateAdminLoginHistoryTable20260119000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create admin_login_history table
    await queryRunner.createTable(
      new Table({
        name: 'admin_login_history',
        schema: 'oracle',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          {
            name: 'admin_id',
            type: 'int',
            isNullable: false,
          },
          {
            name: 'username',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'role',
            type: 'varchar',
            length: '50',
            default: `'admin'`,
            isNullable: false,
          },
          {
            name: 'login_time',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'login_status',
            type: 'varchar',
            length: '50',
            isNullable: false,
          },
          {
            name: 'ip_v4',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'ip_v6',
            type: 'varchar',
            length: '45',
            isNullable: true,
          },
          {
            name: 'country',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'city',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'isp',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'browser',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'os',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'device_type',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'user_agent',
            type: 'text',
            isNullable: true,
          },
          {
            name: '2fa_status',
            type: 'varchar',
            length: '50',
            isNullable: true,
          },
          {
            name: 'session_id',
            type: 'varchar',
            length: '255',
            isNullable: true,
          },
          {
            name: 'is_new_device',
            type: 'boolean',
            default: false,
            isNullable: false,
          },
          {
            name: 'logout_time',
            type: 'timestamp',
            isNullable: true,
          },
          {
            name: 'session_duration_minutes',
            type: 'int',
            isNullable: true,
          },
          {
            name: 'failed_attempts_before_success',
            type: 'int',
            default: 0,
            isNullable: false,
          },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    // Create indexes
    await queryRunner.createIndex(
      new Table({ name: 'admin_login_history', schema: 'oracle' }),
      new TableIndex({
        name: 'IDX_admin_login_history_admin_id',
        columnNames: ['admin_id'],
      }),
    );

    await queryRunner.createIndex(
      new Table({ name: 'admin_login_history', schema: 'oracle' }),
      new TableIndex({
        name: 'IDX_admin_login_history_login_time',
        columnNames: ['login_time'],
      }),
    );

    await queryRunner.createIndex(
      new Table({ name: 'admin_login_history', schema: 'oracle' }),
      new TableIndex({
        name: 'IDX_admin_login_history_status',
        columnNames: ['login_status'],
      }),
    );

    await queryRunner.createIndex(
      new Table({ name: 'admin_login_history', schema: 'oracle' }),
      new TableIndex({
        name: 'IDX_admin_login_history_session_id',
        columnNames: ['session_id'],
      }),
    );

    // Create foreign key
    await queryRunner.createForeignKey(
      new Table({ name: 'admin_login_history', schema: 'oracle' }),
      new TableForeignKey({
        name: 'FK_admin_login_history_user_id',
        columnNames: ['admin_id'],
        referencedTableName: 'users',
        referencedSchema: 'oracle',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable(new Table({ name: 'admin_login_history', schema: 'oracle' }), true, true);
  }
}
