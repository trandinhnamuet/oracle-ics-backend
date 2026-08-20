import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateProcessedSepayTransactionsTable20260820100001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.processed_sepay_transactions');
    if (tableExists) {
      console.log('Table oracle.processed_sepay_transactions already exists, skipping');
      return;
    }

    await queryRunner.query(`
      CREATE TABLE oracle.processed_sepay_transactions (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        bank_tx_id character varying(100) NOT NULL,
        payment_id uuid,
        processed_at timestamp NOT NULL DEFAULT now(),
        CONSTRAINT processed_sepay_transactions_pkey PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX uq_processed_sepay_bank_tx_id ON oracle.processed_sepay_transactions (bank_tx_id)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.processed_sepay_transactions CASCADE`);
  }
}
