import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class CreateExchangeRateTable20251013000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists to prevent re-creation errors
    const tableExists = await queryRunner.hasTable('oracle.exchange_rate');
    if (tableExists) {
        console.log('⏭️ Table oracle.exchange_rate already exists, skipping');
        return;
    }

    await queryRunner.createTable(
      new Table({
        name: "exchange_rate",
        schema: "oracle",
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
    await queryRunner.dropTable("oracle.exchange_rate");
  }
}
