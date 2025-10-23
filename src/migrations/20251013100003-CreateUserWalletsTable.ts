import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateUserWalletsTable20251013100003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE oracle.user_wallets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        balance NUMERIC(18,6) DEFAULT 0,
        currency VARCHAR(10) DEFAULT 'VND',
        last_payment_id UUID,
        status VARCHAR(20),
        is_active BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `)

    // Create indexes for better performance
    await queryRunner.query(`
      CREATE INDEX IDX_user_wallets_user_id ON oracle.user_wallets(user_id);
    `)
    
    await queryRunner.query(`
      CREATE INDEX IDX_user_wallets_status ON oracle.user_wallets(status);
    `)

    await queryRunner.query(`
      CREATE INDEX IDX_user_wallets_last_payment_id ON oracle.user_wallets(last_payment_id);
    `)

    console.log('Đã tạo bảng oracle.user_wallets')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE oracle.user_wallets;
    `)
    console.log('Đã xóa bảng oracle.user_wallets')
  }
}