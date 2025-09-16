import { MigrationInterface, QueryRunner } from "typeorm";

export class DropDemoAndDemo2Tables1694339400000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS demo2;`);
        await queryRunner.query(`DROP TABLE IF EXISTS demo;`);
        console.log('Đã xóa bảng demo và demo2');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE demo (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        await queryRunner.query(`
            CREATE TABLE demo2 (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('Đã tạo lại bảng demo và demo2');
    }
}
