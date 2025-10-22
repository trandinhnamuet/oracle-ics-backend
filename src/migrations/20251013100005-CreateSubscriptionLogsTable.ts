import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateSubscriptionLogsTable20251013100005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE oracle.subscription_logs (
        id SERIAL PRIMARY KEY,
        subscription_id UUID NOT NULL,
        user_id INTEGER NOT NULL,
        action VARCHAR(20),
        status_old VARCHAR(100),
        status_new VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `)

    // Create indexes for better performance
    await queryRunner.query(`
      CREATE INDEX IDX_subscription_logs_subscription_id ON oracle.subscription_logs(subscription_id);
    `)
    
    await queryRunner.query(`
      CREATE INDEX IDX_subscription_logs_user_id ON oracle.subscription_logs(user_id);
    `)

    await queryRunner.query(`
      CREATE INDEX IDX_subscription_logs_action ON oracle.subscription_logs(action);
    `)

    await queryRunner.query(`
      CREATE INDEX IDX_subscription_logs_created_at ON oracle.subscription_logs(created_at);
    `)

    console.log('Đã tạo bảng oracle.subscription_logs')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE oracle.subscription_logs;
    `)
    console.log('Đã xóa bảng oracle.subscription_logs')
  }
}