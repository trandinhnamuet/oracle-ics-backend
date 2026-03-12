import { MigrationInterface, QueryRunner } from 'typeorm'

export class SetAutoRenewDefaultTrue20260312000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Đổi default của cột auto_renew từ false sang true
    await queryRunner.query(`
      ALTER TABLE oracle.subscriptions
        ALTER COLUMN auto_renew SET DEFAULT true;
    `)
    console.log('Đã đổi default auto_renew thành true cho bảng oracle.subscriptions')
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.subscriptions
        ALTER COLUMN auto_renew SET DEFAULT false;
    `)
  }
}
