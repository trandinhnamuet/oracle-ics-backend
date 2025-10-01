import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddRoleToUserTable1696060000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "role",
        type: "varchar",
        length: "20",
        isNullable: false,
        default: "'customer'"
      })
    );
    // Đảm bảo các bản ghi cũ đều có role là 'customer'
    await queryRunner.query(`UPDATE "users" SET "role" = 'customer' WHERE "role" IS NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("users", "role");
  }
}
