import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateSubscriptionsTable20251126000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Thêm các cột nếu chưa có
    await queryRunner.query(`
      ALTER TABLE oracle.subscriptions 
        ADD COLUMN IF NOT EXISTS configuration_status VARCHAR(50) DEFAULT 'pending_setup',
        ADD COLUMN IF NOT EXISTS vm_instance_id UUID,
        ADD COLUMN IF NOT EXISTS last_configured_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS provisioning_error TEXT;
    `);

    // Thêm FK chỉ khi chưa tồn tại
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_subscriptions_vm_instance'
        ) THEN
          ALTER TABLE oracle.subscriptions
            ADD CONSTRAINT fk_subscriptions_vm_instance
            FOREIGN KEY (vm_instance_id)
            REFERENCES oracle.vm_instances(id)
            ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // Tạo indexes và comments riêng biệt
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_configuration_status ON oracle.subscriptions(configuration_status);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_vm_instance_id ON oracle.subscriptions(vm_instance_id);`);
    await queryRunner.query(`COMMENT ON COLUMN oracle.subscriptions.configuration_status IS 'VM configuration status: pending_setup, configuring, provisioning, active, failed';`);
    await queryRunner.query(`COMMENT ON COLUMN oracle.subscriptions.vm_instance_id IS 'Reference to the provisioned VM instance';`);
    await queryRunner.query(`COMMENT ON COLUMN oracle.subscriptions.last_configured_at IS 'Timestamp when VM was last configured/re-configured';`);
    await queryRunner.query(`COMMENT ON COLUMN oracle.subscriptions.provisioning_error IS 'Error message if VM provisioning failed';`);
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
