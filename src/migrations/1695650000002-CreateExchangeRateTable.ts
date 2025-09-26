import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateExchangeRateTable1695650000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "exchange_rate",
        columns: [
          {
            name: "id",
            type: "int",
            isPrimary: true,
            isGenerated: true,
            generationStrategy: "increment",
          },
          {
            name: "currency_from",
            type: "varchar",
            length: "10",
            isNullable: false,
          },
          {
            name: "currency_to",
            type: "varchar",
            length: "10",
            isNullable: false,
          },
          {
            name: "date",
            type: "date",
            isNullable: false,
          },
          {
            name: "direction",
            type: "varchar",
            length: "10",
            isNullable: false,
          },
          {
            name: "rate",
            type: "float",
            isNullable: false,
          },
        ],
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("exchange_rate");
  }
}
