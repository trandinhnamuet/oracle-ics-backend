import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddGoogleAuthFields20260127000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add googleId column
    await queryRunner.addColumn(
      'oracle.users',
      new TableColumn({
        name: 'google_id',
        type: 'varchar',
        length: '255',
        isNullable: true,
        isUnique: true,
      })
    );

    // Add authProvider column
    await queryRunner.addColumn(
      'oracle.users',
      new TableColumn({
        name: 'auth_provider',
        type: 'varchar',
        length: '50',
        default: "'local'",
        isNullable: false,
      })
    );

    // Make password nullable for Google OAuth users
    await queryRunner.changeColumn(
      'oracle.users',
      'password',
      new TableColumn({
        name: 'password',
        type: 'varchar',
        length: '255',
        isNullable: true, // Changed from false to true
      })
    );

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

    // Make password required again
    await queryRunner.changeColumn(
      'oracle.users',
      'password',
      new TableColumn({
        name: 'password',
        type: 'varchar',
        length: '255',
        isNullable: false,
      })
    );

    // Note: We don't remove avatarUrl as it might have been added by another migration
  }
}
