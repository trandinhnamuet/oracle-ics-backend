import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDashboardRegistrationRequests1695550100000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE dashboard.registration_requests (
                id SERIAL PRIMARY KEY,
                user_name VARCHAR(100) NOT NULL,
                email VARCHAR(150) NOT NULL,
                phone_number VARCHAR(20) NOT NULL,
                company VARCHAR(150),
                additional_notes TEXT,
                plan_name VARCHAR(100) NOT NULL,
                plan_description TEXT,
                plan_price VARCHAR(50),
                submitted_at TIMESTAMP DEFAULT NOW(),
                is_served BOOLEAN
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE IF EXISTS dashboard.registration_requests`);
    }
}
