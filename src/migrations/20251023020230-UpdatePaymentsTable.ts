import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdatePaymentsTable20251023020230 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Thêm các column còn thiếu vào bảng payments
    await queryRunner.query(`
      ALTER TABLE oracle.payments 
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
      ADD COLUMN IF NOT EXISTS metadata JSON NULL
    `);

    // Tạo trigger để tự động update updated_at
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
      DROP TRIGGER IF EXISTS update_payments_updated_at ON oracle.payments;
      CREATE TRIGGER update_payments_updated_at
        BEFORE UPDATE ON oracle.payments
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Xóa trigger và function
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS update_payments_updated_at ON oracle.payments;
    `);
    
    await queryRunner.query(`
      DROP FUNCTION IF EXISTS update_updated_at_column();
    `);

    // Xóa các column đã thêm
    await queryRunner.query(`
      ALTER TABLE oracle.payments 
      DROP COLUMN IF EXISTS created_at,
      DROP COLUMN IF EXISTS updated_at,
      DROP COLUMN IF EXISTS metadata
    `);
  }
}
