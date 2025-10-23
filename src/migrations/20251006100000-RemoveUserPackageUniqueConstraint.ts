import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveUserPackageUniqueConstraint20251006100000 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        const indexExists = await queryRunner.query(`
            SELECT 1
            FROM pg_indexes
            WHERE tablename = 'user_package' AND indexname = 'IDX_USER_PACKAGE_UNIQUE'
        `);

        if (indexExists.length > 0) {
            await queryRunner.dropIndex('user_package', 'IDX_USER_PACKAGE_UNIQUE');
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createIndex(
            "user_package",
            new (require("typeorm").TableIndex)({
                name: "IDX_USER_PACKAGE_UNIQUE",
                columnNames: ["user_id", "package_id"],
                isUnique: true,
            })
        );
    }
}
