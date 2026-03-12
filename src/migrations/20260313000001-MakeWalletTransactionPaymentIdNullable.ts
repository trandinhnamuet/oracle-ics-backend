import { MigrationInterface, QueryRunner } from 'typeorm'

export class MakeWalletTransactionPaymentIdNullable20260313000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.wallet_transactions
      ALTER COLUMN payment_id DROP NOT NULL;
    `)
    console.log('wallet_transactions.payment_id is now nullable')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-apply NOT NULL only if all rows have a non-null payment_id
    await queryRunner.query(`
      ALTER TABLE oracle.wallet_transactions
      ALTER COLUMN payment_id SET NOT NULL;
    `)
    console.log('wallet_transactions.payment_id restored to NOT NULL')
  }
}
