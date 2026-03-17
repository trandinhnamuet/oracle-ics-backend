import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateUsersTable1694339500000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE oracle.users (
                id SERIAL PRIMARY KEY,
                email VARCHAR(255) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                first_name VARCHAR(255) NOT NULL,
                last_name VARCHAR(255) NOT NULL,
                is_active BOOLEAN DEFAULT true,
                phone_number VARCHAR(20),
                company VARCHAR(255),
                role VARCHAR(20) DEFAULT 'customer' NOT NULL,
                avatar_url VARCHAR(500) NULL,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            );
        `);
        console.log('Đã tạo bảng oracle.users với các cột bổ sung');
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            DROP TABLE oracle.users;
        `);
        console.log('Đã xóa bảng oracle.users');
    }
}
