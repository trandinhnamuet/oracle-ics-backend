import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddGoogleAuthFields20260127000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add columns với IF NOT EXISTS để an toàn khi chạy lại
    await queryRunner.query(`ALTER TABLE oracle.users ADD COLUMN IF NOT EXISTS google_id VARCHAR(255)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google_id ON oracle.users(google_id) WHERE google_id IS NOT NULL`);
    await queryRunner.query(`ALTER TABLE oracle.users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(50) NOT NULL DEFAULT 'local'`);

    // Make password nullable using raw query to preserve data
    // DO NOT use changeColumn() - it will drop and recreate, losing all data!
    await queryRunner.query(`
      ALTER TABLE oracle.users 
      ALTER COLUMN password DROP NOT NULL
    `);

    // Add avatarUrl column if it doesn't exist
    const table = await queryRunner.getTable('oracle.users');
    const avatarColumn = table?.findColumnByName('avatar_url');
    
    if (!avatarColumn) {
      await queryRunner.addColumn(
        'oracle.users',
        new TableColumn({
          name: 'avatar_url',
          type: 'text',
          isNullable: true,
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove googleId column
    await queryRunner.dropColumn('oracle.users', 'google_id');

    // Remove authProvider column
    await queryRunner.dropColumn('oracle.users', 'auth_provider');

    // Make password required again - only if all passwords are set
    await queryRunner.query(`
      ALTER TABLE oracle.users 
      ALTER COLUMN password SET NOT NULL
    `);

    // Remove avatarUrl if it was added by this migration
    const table = await queryRunner.getTable('oracle.users');
    const avatarColumn = table?.findColumnByName('avatar_url');
    if (avatarColumn) {
      await queryRunner.dropColumn('oracle.users', 'avatar_url');
    }
  }
}
