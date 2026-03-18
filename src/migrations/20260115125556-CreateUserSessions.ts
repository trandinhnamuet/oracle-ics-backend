import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateUserSessions20260115125556 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists to avoid recreation
    const tableExists = await queryRunner.hasTable('oracle.user_sessions');
    if (tableExists) {
      console.log('⏭️ Table oracle.user_sessions already exists, skipping creation');
      return;
    }

    // Create user_sessions table in oracle schema
    await queryRunner.createTable(
      new Table({
        name: 'user_sessions',
        schema: 'oracle',
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
      'oracle.user_sessions',
      new TableIndex({
        name: 'IDX_user_sessions_userId',
        columnNames: ['userId'],
      }),
    );

    // Create index on expiresAt for cleanup queries
    await queryRunner.createIndex(
      'oracle.user_sessions',
      new TableIndex({
        name: 'IDX_user_sessions_expiresAt',
        columnNames: ['expiresAt'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('oracle.user_sessions', true);
  }
}
