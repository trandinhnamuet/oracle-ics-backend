import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from "typeorm";

export class CreateUserPackageTable1694340100000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "user_package",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "user_id",
            type: "int",
            isNullable: false,
          },
          {
            name: "package_id",
            type: "int",
            isNullable: false,
          },
          {
            name: "is_paid",
            type: "boolean",
            default: false,
            isNullable: false,
          },
          {
            name: "created_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
            isNullable: false,
          },
          {
            name: "updated_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
            isNullable: false,
          },
        ],
      })
    );

    // Create index for user_id
    await queryRunner.createIndex(
      "user_package",
      new TableIndex({
        name: "IDX_USER_PACKAGE_USER_ID",
        columnNames: ["user_id"],
      })
    );

    // Create index for package_id
    await queryRunner.createIndex(
      "user_package",
      new TableIndex({
        name: "IDX_USER_PACKAGE_PACKAGE_ID",
        columnNames: ["package_id"],
      })
    );

    // Create unique index for user_id and package_id combination
    await queryRunner.createIndex(
      "user_package",
      new TableIndex({
        name: "IDX_USER_PACKAGE_UNIQUE",
        columnNames: ["user_id", "package_id"],
        isUnique: true,
      })
    );

    // Create foreign key constraint for user_id
    await queryRunner.createForeignKey(
      "user_package",
      new TableForeignKey({
        columnNames: ["user_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "users",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      })
    );

    // Create foreign key constraint for package_id
    await queryRunner.createForeignKey(
      "user_package",
      new TableForeignKey({
        columnNames: ["package_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "package_subscriptions",
        onDelete: "CASCADE",
        onUpdate: "CASCADE",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop foreign keys first
    const table = await queryRunner.getTable("user_package");
    if (table) {
      const foreignKeys = table.foreignKeys.filter(fk => 
        fk.columnNames.indexOf("user_id") !== -1 || 
        fk.columnNames.indexOf("package_id") !== -1
      );
      
      for (const foreignKey of foreignKeys) {
        await queryRunner.dropForeignKey("user_package", foreignKey);
      }
    }

    // Drop indexes
    await queryRunner.dropIndex("user_package", "IDX_USER_PACKAGE_USER_ID");
    await queryRunner.dropIndex("user_package", "IDX_USER_PACKAGE_PACKAGE_ID");
    await queryRunner.dropIndex("user_package", "IDX_USER_PACKAGE_UNIQUE");

    // Drop table
    await queryRunner.dropTable("user_package");
  }
}