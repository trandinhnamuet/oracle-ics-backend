import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExchangeRateTable20260508100004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.exchange_rate');
    if (tableExists) { console.log('Table oracle.exchange_rate already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.exchange_rate (
        id SERIAL NOT NULL,
        currency_from character varying(10) NOT NULL,
        currency_to character varying(10) NOT NULL,
        date date NOT NULL,
        direction character varying(10) NOT NULL,
        rate double precision NOT NULL,
        CONSTRAINT "PK_5c5d27d2b900ef6cdeef0398472" PRIMARY KEY (id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.exchange_rate CASCADE`);
  }
}
