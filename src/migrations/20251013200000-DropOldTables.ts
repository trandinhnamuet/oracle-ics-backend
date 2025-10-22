import { MigrationInterface, QueryRunner } from 'typeorm';

export class DropOldTables20251013200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop user_package table first (has foreign key to package_subscriptions)
    await queryRunner.query(`
      DROP TABLE IF EXISTS user_package CASCADE;
    `);
    
    // Drop package_subscriptions table
    await queryRunner.query(`
      DROP TABLE IF EXISTS package_subscriptions CASCADE;
    `);
    
    console.log('Đã xóa bảng user_package và package_subscriptions');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Note: This migration cannot be easily rolled back as it drops tables and data
    // If rollback is needed, you would need to recreate tables and restore data from backup
    console.log('WARNING: Cannot rollback table drops. Restore from backup if needed.');
    throw new Error('Cannot rollback table drops. Manual restoration required.');
  }
}