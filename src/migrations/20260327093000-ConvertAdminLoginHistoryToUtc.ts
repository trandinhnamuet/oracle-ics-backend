import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertAdminLoginHistoryToUtc20260327093000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.admin_login_history
      ALTER COLUMN login_time TYPE TIMESTAMPTZ
      USING login_time AT TIME ZONE 'Asia/Ho_Chi_Minh';
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.admin_login_history
      ALTER COLUMN logout_time TYPE TIMESTAMPTZ
      USING logout_time AT TIME ZONE 'Asia/Ho_Chi_Minh';
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.admin_login_history
      ALTER COLUMN created_at TYPE TIMESTAMPTZ
      USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.admin_login_history
      ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.admin_login_history
      ALTER COLUMN login_time TYPE TIMESTAMP
      USING login_time AT TIME ZONE 'Asia/Ho_Chi_Minh';
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.admin_login_history
      ALTER COLUMN logout_time TYPE TIMESTAMP
      USING logout_time AT TIME ZONE 'Asia/Ho_Chi_Minh';
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.admin_login_history
      ALTER COLUMN created_at TYPE TIMESTAMP
      USING created_at AT TIME ZONE 'Asia/Ho_Chi_Minh';
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.admin_login_history
      ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP;
    `);
  }
}
