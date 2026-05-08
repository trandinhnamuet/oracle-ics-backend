import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSubscriptionsVmInstanceFk20260508100015 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const result = await queryRunner.query(`
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'fk_subscriptions_vm_instance'
        AND table_schema = 'oracle' AND table_name = 'subscriptions'
    `);
    if (result.length > 0) { console.log('FK fk_subscriptions_vm_instance already exists, skipping'); return; }

    await queryRunner.query(`
      ALTER TABLE oracle.subscriptions
        ADD CONSTRAINT fk_subscriptions_vm_instance
        FOREIGN KEY (vm_instance_id) REFERENCES oracle.vm_instances(id) ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE oracle.subscriptions DROP CONSTRAINT IF EXISTS fk_subscriptions_vm_instance
    `);
  }
}
