import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveUserPackageUniqueConstraint1694340200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("user_package", "IDX_USER_PACKAGE_UNIQUE");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex(
      "user_package",
      new (require("typeorm").TableIndex)({
        name: "IDX_USERfesfsPACKAGE_UNIQUE",
        columnNames: ["user_id", "package_id"],
        isUnique: true,
      })
    );
  }
}
