import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateSubscriptionsTable20251013100002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE oracle.subscriptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id INTEGER NOT NULL,
        cloud_package_id INTEGER NOT NULL,
        start_date TIMESTAMP NOT NULL,
        end_date TIMESTAMP NOT NULL,
        status VARCHAR(20),
        auto_renew BOOLEAN DEFAULT false,
        amount_paid NUMERIC(15,2) DEFAULT 0,
        months_paid INTEGER DEFAULT 1,
        configuration JSON,
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `)

    // Create indexes for better performance
    await queryRunner.query(`
      CREATE INDEX IDX_subscriptions_user_id ON oracle.subscriptions(user_id);
    `)
    
    await queryRunner.query(`
      CREATE INDEX IDX_subscriptions_cloud_package_id ON oracle.subscriptions(cloud_package_id);
    `)

    await queryRunner.query(`
      CREATE INDEX IDX_subscriptions_status ON oracle.subscriptions(status);
    `)

    await queryRunner.query(`
      CREATE INDEX IDX_subscriptions_start_date ON oracle.subscriptions(start_date);
    `)

    await queryRunner.query(`
      CREATE INDEX IDX_subscriptions_end_date ON oracle.subscriptions(end_date);
    `)

    console.log('Đã tạo bảng oracle.subscriptions')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE oracle.subscriptions;
    `)
    console.log('Đã xóa bảng oracle.subscriptions')
  }
}