import { MigrationInterface, QueryRunner } from 'typeorm';

export class ChangeVmIdToInteger20260120000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 1: Drop all foreign key constraints that depend on vm_instances.id
    await queryRunner.query(`
      ALTER TABLE oracle.vm_actions_log 
      DROP CONSTRAINT IF EXISTS fk_vm_actions_log_vm_instance CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.vm_actions_log 
      DROP CONSTRAINT IF EXISTS fk_vm_actions_log_vm CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.subscriptions 
      DROP CONSTRAINT IF EXISTS fk_subscriptions_vm_instance CASCADE
    `);

    // Step 2: Clear existing data BEFORE changing column types
    await queryRunner.query(`TRUNCATE TABLE oracle.vm_actions_log CASCADE`);
    await queryRunner.query(`TRUNCATE TABLE oracle.subscriptions CASCADE`);
    await queryRunner.query(`TRUNCATE TABLE oracle.vm_instances CASCADE`);

    // Step 3: Change vm_instances.id from UUID to SERIAL
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances 
      DROP COLUMN id CASCADE
    `);
    
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances 
      ADD COLUMN id SERIAL PRIMARY KEY
    `);

    // Step 4: Change vm_actions_log.vm_instance_id from UUID to INTEGER
    await queryRunner.query(`
      ALTER TABLE oracle.vm_actions_log 
      DROP COLUMN vm_instance_id
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.vm_actions_log 
      ADD COLUMN vm_instance_id INTEGER
    `);

    // Step 5: Change subscriptions.vm_instance_id from UUID to INTEGER
    await queryRunner.query(`
      ALTER TABLE oracle.subscriptions 
      DROP COLUMN vm_instance_id
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.subscriptions 
      ADD COLUMN vm_instance_id INTEGER
    `);

    // Step 6: Re-add foreign key constraint for vm_actions_log
    await queryRunner.query(`
      ALTER TABLE oracle.vm_actions_log 
      ADD CONSTRAINT fk_vm_actions_log_vm_instance 
      FOREIGN KEY (vm_instance_id) 
      REFERENCES oracle.vm_instances(id) 
      ON DELETE CASCADE
    `);

    // Step 7: Re-add foreign key constraint for subscriptions
    await queryRunner.query(`
      ALTER TABLE oracle.subscriptions 
      ADD CONSTRAINT fk_subscriptions_vm_instance 
      FOREIGN KEY (vm_instance_id) 
      REFERENCES oracle.vm_instances(id) 
      ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert changes
    await queryRunner.query(`
      ALTER TABLE oracle.vm_actions_log 
      DROP CONSTRAINT IF EXISTS fk_vm_actions_log_vm_instance CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.subscriptions 
      DROP CONSTRAINT IF EXISTS fk_subscriptions_vm_instance CASCADE
    `);

    // Clear data before changing column types
    await queryRunner.query(`TRUNCATE TABLE oracle.vm_actions_log CASCADE`);
    await queryRunner.query(`TRUNCATE TABLE oracle.subscriptions CASCADE`);
    await queryRunner.query(`TRUNCATE TABLE oracle.vm_instances CASCADE`);

    // Revert vm_instances.id to UUID
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances 
      DROP COLUMN id CASCADE
    `);
    
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances 
      ADD COLUMN id UUID DEFAULT gen_random_uuid() PRIMARY KEY
    `);

    // Revert vm_actions_log.vm_instance_id to UUID
    await queryRunner.query(`
      ALTER TABLE oracle.vm_actions_log 
      DROP COLUMN vm_instance_id
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.vm_actions_log 
      ADD COLUMN vm_instance_id UUID
    `);

    // Revert subscriptions.vm_instance_id to UUID
    await queryRunner.query(`
      ALTER TABLE oracle.subscriptions 
      DROP COLUMN vm_instance_id
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.subscriptions 
      ADD COLUMN vm_instance_id UUID
    `);

    // Re-add foreign key constraints
    await queryRunner.query(`
      ALTER TABLE oracle.vm_actions_log 
      ADD CONSTRAINT fk_vm_actions_log_vm_instance 
      FOREIGN KEY (vm_instance_id) 
      REFERENCES oracle.vm_instances(id) 
      ON DELETE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE oracle.subscriptions 
      ADD CONSTRAINT fk_subscriptions_vm_instance 
      FOREIGN KEY (vm_instance_id) 
      REFERENCES oracle.vm_instances(id) 
      ON DELETE CASCADE
    `);
  }
}
