import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCloudPackagesTable20251013100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE oracle.cloud_packages (
        id SERIAL PRIMARY KEY,
        name VARCHAR(20) NOT NULL,
        type VARCHAR(20),
        cost NUMERIC(15,6) NOT NULL,
        cost_vnd NUMERIC(18,6) NOT NULL,
        cpu VARCHAR(50),
        ram VARCHAR(50),
        memory VARCHAR(50),
        feature VARCHAR(50),
        bandwidth VARCHAR(50),
        updated_at TIMESTAMP DEFAULT NOW(),
        updated_by INTEGER,
        is_active BOOLEAN DEFAULT true
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_cloud_packages_type ON oracle.cloud_packages(type);
    `);
    await queryRunner.query(`
      CREATE INDEX IDX_cloud_packages_is_active ON oracle.cloud_packages(is_active);
    `);
    console.log('Đã tạo bảng oracle.cloud_packages');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE oracle.cloud_packages;
    `);
    console.log('Đã xóa bảng oracle.cloud_packages');
  }
}