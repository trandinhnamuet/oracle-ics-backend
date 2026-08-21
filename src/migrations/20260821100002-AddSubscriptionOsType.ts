import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptionOsType20260821100002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.hasColumn('oracle.subscriptions', 'os_type');
    if (!hasColumn) {
      await queryRunner.query(
        `ALTER TABLE oracle.subscriptions ADD COLUMN os_type character varying(10) NOT NULL DEFAULT 'linux'`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE oracle.subscriptions DROP COLUMN IF EXISTS os_type`);
  }
}
