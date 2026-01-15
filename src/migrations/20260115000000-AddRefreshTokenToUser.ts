import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRefreshTokenToUser1705276800000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('oracle.users');

    // Check if columns already exist
    const hasRefreshToken = table?.columns.some(col => col.name === 'refresh_token');
    const hasRefreshTokenExpiresAt = table?.columns.some(col => col.name === 'refresh_token_expires_at');

    if (!hasRefreshToken) {
      await queryRunner.addColumn(
        'oracle.users',
        new TableColumn({
          name: 'refresh_token',
          type: 'varchar',
          length: '500',
          isNullable: true,
        })
      );
    }

    if (!hasRefreshTokenExpiresAt) {
      await queryRunner.addColumn(
        'oracle.users',
        new TableColumn({
          name: 'refresh_token_expires_at',
          type: 'timestamp',
          isNullable: true,
        })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('oracle.users');

    const hasRefreshToken = table?.columns.some(col => col.name === 'refresh_token');
    const hasRefreshTokenExpiresAt = table?.columns.some(col => col.name === 'refresh_token_expires_at');

    if (hasRefreshToken) {
      await queryRunner.dropColumn('oracle.users', 'refresh_token');
    }

    if (hasRefreshTokenExpiresAt) {
      await queryRunner.dropColumn('oracle.users', 'refresh_token_expires_at');
    }
  }
}
