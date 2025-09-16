import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDemo2Table1694339300000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE demo2 (
                id SERIAL PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('Đã tạo bảng demo2');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE demo2;
        `);
        console.log('Đã xóa bảng demo2');
    }
}
