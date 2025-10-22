import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreatePaymentsTable20251013100001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE oracle.payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER NOT NULL,
        amount NUMERIC(18,6) NOT NULL,
        subscription_id UUID,
        cloud_package_id INTEGER,
        payment_method VARCHAR(50),
        payment_type VARCHAR(50),
        transaction_code VARCHAR(100),
        status VARCHAR(50),
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP
      );
    `)

    // Create indexes for better performance
    await queryRunner.query(`
      CREATE INDEX IDX_payments_user_id ON oracle.payments(user_id);
    `)
    
    await queryRunner.query(`
      CREATE INDEX IDX_payments_subscription_id ON oracle.payments(subscription_id);
    `)

    await queryRunner.query(`
      CREATE INDEX IDX_payments_cloud_package_id ON oracle.payments(cloud_package_id);
    `)

    await queryRunner.query(`
      CREATE INDEX IDX_payments_status ON oracle.payments(status);
    `)

    await queryRunner.query(`
      CREATE INDEX IDX_payments_transaction_code ON oracle.payments(transaction_code);
    `)

    console.log('Đã tạo bảng oracle.payments')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE oracle.payments;
    `)
    console.log('Đã xóa bảng oracle.payments')
  }
}