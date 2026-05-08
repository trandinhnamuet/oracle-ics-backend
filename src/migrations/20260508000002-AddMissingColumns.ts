import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingColumns20260508000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // vm_instances.windows_current_password: last successfully-set Windows password
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances
        ADD COLUMN IF NOT EXISTS windows_current_password TEXT;
    `);
    console.log('✅ vm_instances.windows_current_password added');

    // subscription_logs.description + metadata: action detail fields
    await queryRunner.query(`
      ALTER TABLE oracle.subscription_logs
        ADD COLUMN IF NOT EXISTS description TEXT,
        ADD COLUMN IF NOT EXISTS metadata JSON;
    `);
    console.log('✅ subscription_logs.description and metadata added');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances DROP COLUMN IF EXISTS windows_current_password;
    `);
    await queryRunner.query(`
      ALTER TABLE oracle.subscription_logs
        DROP COLUMN IF EXISTS description,
        DROP COLUMN IF EXISTS metadata;
    `);
  }
}
