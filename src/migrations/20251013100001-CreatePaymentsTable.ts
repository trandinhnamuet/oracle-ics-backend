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
        metadata JSON NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
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

    // Create trigger for updating updated_at
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql';
    `);

    await queryRunner.query(`
      CREATE TRIGGER update_payments_updated_at
        BEFORE UPDATE ON oracle.payments
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    console.log('Đã tạo bảng oracle.payments với các cột bổ sung và trigger')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS update_payments_updated_at ON oracle.payments;
    `);

    await queryRunner.query(`
      DROP FUNCTION IF EXISTS update_updated_at_column();
    `);

    await queryRunner.query(`
      DROP TABLE oracle.payments;
    `)
    console.log('Đã xóa bảng oracle.payments')
  }
}