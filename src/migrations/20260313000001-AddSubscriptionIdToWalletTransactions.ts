import { MigrationInterface, QueryRunner } from 'typeorm'

export class AddSubscriptionIdToWalletTransactions20260313000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE oracle.wallet_transactions ADD COLUMN IF NOT EXISTS subscription_id UUID NULL;`)

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS IDX_wallet_transactions_subscription_id ON oracle.wallet_transactions(subscription_id);`)

    console.log('Đã thêm cột subscription_id vào bảng oracle.wallet_transactions')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS oracle.IDX_wallet_transactions_subscription_id;
    `)

    await queryRunner.query(`
      ALTER TABLE oracle.wallet_transactions
      DROP COLUMN IF EXISTS subscription_id;
    `)

    console.log('Đã xóa cột subscription_id khỏi bảng oracle.wallet_transactions')
  }
}
