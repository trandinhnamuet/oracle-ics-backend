import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateUserSessions20260115125556 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create user_sessions table
    await queryRunner.createTable(
      new Table({
        name: 'user_sessions',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'userId',
            type: 'varchar',
            isNullable: false,
          },
          {
            name: 'refreshTokenHash',
            type: 'text',
            isNullable: false,
          },
          {
            name: 'userAgent',
            type: 'varchar',
            length: '500',
            isNullable: true,
          },
          {
            name: 'ipAddress',
            type: 'varchar',
            length: '100',
            isNullable: true,
          },
          {
            name: 'expiresAt',
            type: 'timestamp',
            isNullable: false,
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
          },
        ],
      }),
      true,
    );

    // Create index on userId for faster lookups
    await queryRunner.createIndex(
      'user_sessions',
      new TableIndex({
        name: 'IDX_user_sessions_userId',
        columnNames: ['userId'],
      }),
    );

    // Create index on expiresAt for cleanup queries
    await queryRunner.createIndex(
      'user_sessions',
      new TableIndex({
        name: 'IDX_user_sessions_expiresAt',
        columnNames: ['expiresAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_sessions');
  }
}
