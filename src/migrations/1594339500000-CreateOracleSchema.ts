import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOracleSchema1594339500000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE SCHEMA IF NOT EXISTS oracle;
    `);
    console.log('Đã tạo schema oracle');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP SCHEMA IF EXISTS oracle CASCADE;
    `);
    console.log('Đã xóa schema oracle');
  }
}