import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateSubscriptionsTable20251126000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- Add new columns for VM configuration tracking
      ALTER TABLE oracle.subscriptions 
        ADD COLUMN IF NOT EXISTS configuration_status VARCHAR(50) DEFAULT 'pending_setup',
        ADD COLUMN IF NOT EXISTS vm_instance_id UUID,
        ADD COLUMN IF NOT EXISTS last_configured_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS provisioning_error TEXT;
      
      -- Add foreign key constraint to vm_instances
      ALTER TABLE oracle.subscriptions 
        ADD CONSTRAINT fk_subscriptions_vm_instance 
        FOREIGN KEY (vm_instance_id) 
        REFERENCES oracle.vm_instances(id) 
        ON DELETE SET NULL;
      
      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_subscriptions_configuration_status ON oracle.subscriptions(configuration_status);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_vm_instance_id ON oracle.subscriptions(vm_instance_id);
      
      -- Add comments
      COMMENT ON COLUMN oracle.subscriptions.configuration_status IS 'VM configuration status: pending_setup, configuring, provisioning, active, failed';
      COMMENT ON COLUMN oracle.subscriptions.vm_instance_id IS 'Reference to the provisioned VM instance';
      COMMENT ON COLUMN oracle.subscriptions.last_configured_at IS 'Timestamp when VM was last configured/re-configured';
      COMMENT ON COLUMN oracle.subscriptions.provisioning_error IS 'Error message if VM provisioning failed';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- Drop indexes
      DROP INDEX IF EXISTS oracle.idx_subscriptions_vm_instance_id;
      DROP INDEX IF EXISTS oracle.idx_subscriptions_configuration_status;
      
      -- Drop foreign key constraint
      ALTER TABLE oracle.subscriptions 
        DROP CONSTRAINT IF EXISTS fk_subscriptions_vm_instance;
      
      -- Drop columns
      ALTER TABLE oracle.subscriptions 
        DROP COLUMN IF EXISTS provisioning_error,
        DROP COLUMN IF EXISTS last_configured_at,
        DROP COLUMN IF EXISTS vm_instance_id,
        DROP COLUMN IF EXISTS configuration_status;
    `);
  }
}
