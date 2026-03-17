import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateCustomPackageRegistrationsTable1694339600000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            CREATE TABLE oracle.custom_package_registrations (
                id SERIAL PRIMARY KEY,
                user_id INTEGER,
                phone_number VARCHAR(20) NOT NULL,
                email VARCHAR(255) NOT NULL,
                company VARCHAR(255),
                detail TEXT,
                processed BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_by VARCHAR(255)
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE oracle.custom_package_registrations`);
    }

}