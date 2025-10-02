import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddIsActiveAndTotalPaidAmountToUserPackage1696070000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Thêm cột is_active
    await queryRunner.addColumn(
      "user_package",
      new TableColumn({
        name: "is_active",
        type: "boolean",
        default: true,
        isNullable: false
      })
    );

    // Thêm cột total_paid_amount
    await queryRunner.addColumn(
      "user_package",
      new TableColumn({
        name: "total_paid_amount",
        type: "decimal",
        precision: 15,
        scale: 2,
        default: 0,
        isNullable: false
      })
    );

    // Cập nhật các bản ghi hiện tại
    await queryRunner.query(`UPDATE "user_package" SET "is_active" = true WHERE "is_active" IS NULL`);
    await queryRunner.query(`UPDATE "user_package" SET "total_paid_amount" = 0 WHERE "total_paid_amount" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("user_package", "total_paid_amount");
    await queryRunner.dropColumn("user_package", "is_active");
  }
}