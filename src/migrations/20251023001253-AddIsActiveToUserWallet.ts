import { MigrationInterface, QueryRunner, TableColumn } from "typeorm"

export class AddIsActiveToUserWallet20251023001253 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Thêm cột is_active vào bảng user_wallets
        await queryRunner.addColumn("oracle.user_wallets", new TableColumn({
            name: "is_active",
            type: "boolean",
            default: true,
            isNullable: false
        }));

        // Update tất cả records hiện có thành is_active = true
        await queryRunner.query(`UPDATE oracle.user_wallets SET is_active = true WHERE is_active IS NULL`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn("oracle.user_wallets", "is_active");
    }

}