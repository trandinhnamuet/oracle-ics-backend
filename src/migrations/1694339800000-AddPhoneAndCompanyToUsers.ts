import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPhoneAndCompanyToUsers1694339800000 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE users 
            ADD COLUMN phone_number VARCHAR(20),
            ADD COLUMN company VARCHAR(255)
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE users 
            DROP COLUMN phone_number,
            DROP COLUMN company
        `);
    }

}