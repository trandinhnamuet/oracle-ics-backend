import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateWalletTransactionsTable20251013100004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE oracle.wallet_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        wallet_id INTEGER NOT NULL,
        payment_id UUID NOT NULL,
        change_amount NUMERIC(18,6) NOT NULL,
        balance_after NUMERIC(18,6),
        type TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `)

    // Create indexes for better performance
    await queryRunner.query(`
      CREATE INDEX IDX_wallet_transactions_wallet_id ON oracle.wallet_transactions(wallet_id);
    `)
    
    await queryRunner.query(`
      CREATE INDEX IDX_wallet_transactions_payment_id ON oracle.wallet_transactions(payment_id);
    `)

    await queryRunner.query(`
      CREATE INDEX IDX_wallet_transactions_type ON oracle.wallet_transactions(type);
    `)

    await queryRunner.query(`
      CREATE INDEX IDX_wallet_transactions_created_at ON oracle.wallet_transactions(created_at);
    `)

    console.log('Đã tạo bảng oracle.wallet_transactions')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE oracle.wallet_transactions;
    `)
    console.log('Đã xóa bảng oracle.wallet_transactions')
  }
}