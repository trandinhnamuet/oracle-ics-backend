import { MigrationInterface, QueryRunner } from 'typeorm';

export class MoveTablestooracleSchema20251013200001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Move users table to oracle schema
    await queryRunner.query(`
      ALTER TABLE public.users SET SCHEMA oracle;
    `);
    
    // Move exchange_rate table to oracle schema
    await queryRunner.query(`
      ALTER TABLE public.exchange_rate SET SCHEMA oracle;
    `);
    
    // Move custom_package_registrations table to oracle schema
    await queryRunner.query(`
      ALTER TABLE public.custom_package_registrations SET SCHEMA oracle;
    `);
    
    // Move images table to oracle schema
    await queryRunner.query(`
      ALTER TABLE public.images SET SCHEMA oracle;
    `);
    
    console.log('Đã chuyển các bảng users, exchange_rate, custom_package_registrations, images sang schema oracle');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Move tables back to public schema
    await queryRunner.query(`
      ALTER TABLE oracle.users SET SCHEMA public;
    `);
    
    await queryRunner.query(`
      ALTER TABLE oracle.exchange_rate SET SCHEMA public;
    `);
    
    await queryRunner.query(`
      ALTER TABLE oracle.custom_package_registrations SET SCHEMA public;
    `);
    
    await queryRunner.query(`
      ALTER TABLE oracle.images SET SCHEMA public;
    `);
    
    console.log('Đã chuyển các bảng về schema public');
  }
}