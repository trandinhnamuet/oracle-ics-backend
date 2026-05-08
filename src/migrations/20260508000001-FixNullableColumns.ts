import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixNullableColumns20260508000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // wallet_transactions.payment_id: nullable because balance-based subscriptions have no payment record
    await queryRunner.query(`
      ALTER TABLE oracle.wallet_transactions ALTER COLUMN payment_id DROP NOT NULL;
    `);
    console.log('✅ wallet_transactions.payment_id is now nullable');

    // admin_login_history.admin_id: nullable to allow recording failed login attempts for non-existent users
    await queryRunner.query(`
      ALTER TABLE oracle.admin_login_history ALTER COLUMN admin_id DROP NOT NULL;
    `);
    console.log('✅ admin_login_history.admin_id is now nullable');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.wallet_transactions ALTER COLUMN payment_id SET NOT NULL;
    `);
    await queryRunner.query(`
      ALTER TABLE oracle.admin_login_history ALTER COLUMN admin_id SET NOT NULL;
    `);
  }
}
