import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOracleSchema20260508100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const rows = await queryRunner.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'oracle'`
    );
    if (rows.length > 0) { console.log('Schema oracle already exists, skipping'); return; }
    await queryRunner.query(`CREATE SCHEMA oracle`);
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP SCHEMA IF EXISTS oracle CASCADE`);
  }
}
