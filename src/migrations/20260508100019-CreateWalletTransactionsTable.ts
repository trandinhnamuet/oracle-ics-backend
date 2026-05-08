import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWalletTransactionsTable20260508100019 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.wallet_transactions');
    if (tableExists) { console.log('Table oracle.wallet_transactions already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.wallet_transactions (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        wallet_id integer NOT NULL,
        payment_id uuid,
        change_amount numeric(18,6) NOT NULL,
        balance_after numeric(18,6),
        type text,
        created_at timestamp with time zone DEFAULT now(),
        subscription_id uuid,
        CONSTRAINT wallet_transactions_pkey PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_wallet_transactions_created_at ON oracle.wallet_transactions (created_at)`);
    await queryRunner.query(`CREATE INDEX idx_wallet_transactions_payment_id ON oracle.wallet_transactions (payment_id)`);
    await queryRunner.query(`CREATE INDEX idx_wallet_transactions_subscription_id ON oracle.wallet_transactions (subscription_id)`);
    await queryRunner.query(`CREATE INDEX idx_wallet_transactions_type ON oracle.wallet_transactions (type)`);
    await queryRunner.query(`CREATE INDEX idx_wallet_transactions_wallet_id ON oracle.wallet_transactions (wallet_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.wallet_transactions CASCADE`);
  }
}
