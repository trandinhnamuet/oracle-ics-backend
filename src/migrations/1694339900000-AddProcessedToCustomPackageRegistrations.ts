import { MigrationInterface, QueryRunner } from "typeorm";

export class AddProcessedToCustomPackageRegistrations1694339900000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE custom_package_registrations 
            ADD COLUMN processed BOOLEAN DEFAULT FALSE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE custom_package_registrations 
            DROP COLUMN processed
        `);
    }
}
