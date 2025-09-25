import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDashboardSchema1695550000000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS dashboard`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP SCHEMA IF EXISTS dashboard CASCADE`);
    }
}
