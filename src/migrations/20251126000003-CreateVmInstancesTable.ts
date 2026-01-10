import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVmInstancesTable20251126000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // First, ensure uuid extension is enabled
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle.vm_instances (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        subscription_id UUID NOT NULL,
        user_id INTEGER NOT NULL,
        compartment_id VARCHAR(255) NOT NULL,
        instance_id VARCHAR(255) NOT NULL,
        instance_name VARCHAR(255) NOT NULL,
        shape VARCHAR(100),
        image_id VARCHAR(255),
        image_name VARCHAR(255),
        operating_system VARCHAR(100),
        region VARCHAR(50),
        availability_domain VARCHAR(100),
        public_ip VARCHAR(50),
        private_ip VARCHAR(50),
        vcn_id VARCHAR(255),
        subnet_id VARCHAR(255),
        lifecycle_state VARCHAR(50),
        ssh_public_key TEXT,
        ssh_private_key_encrypted TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_vm_instances_user FOREIGN KEY (user_id) REFERENCES oracle.users(id) ON DELETE CASCADE,
        CONSTRAINT fk_vm_instances_subscription FOREIGN KEY (subscription_id) REFERENCES oracle.subscriptions(id) ON DELETE CASCADE,
        CONSTRAINT uk_subscription_vm UNIQUE (subscription_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_vm_instances_user_id ON oracle.vm_instances(user_id);
      CREATE INDEX IF NOT EXISTS idx_vm_instances_subscription_id ON oracle.vm_instances(subscription_id);
      CREATE INDEX IF NOT EXISTS idx_vm_instances_instance_id ON oracle.vm_instances(instance_id);
      CREATE INDEX IF NOT EXISTS idx_vm_instances_compartment_id ON oracle.vm_instances(compartment_id);
      CREATE INDEX IF NOT EXISTS idx_vm_instances_lifecycle_state ON oracle.vm_instances(lifecycle_state);
      CREATE INDEX IF NOT EXISTS idx_vm_instances_region ON oracle.vm_instances(region);
      
      COMMENT ON TABLE oracle.vm_instances IS 'Stores OCI compute instances (VMs) provisioned for subscriptions';
      COMMENT ON COLUMN oracle.vm_instances.instance_id IS 'OCID of the OCI compute instance';
      COMMENT ON COLUMN oracle.vm_instances.lifecycle_state IS 'OCI instance state: PROVISIONING, RUNNING, STOPPING, STOPPED, STARTING, TERMINATING, TERMINATED';
      COMMENT ON COLUMN oracle.vm_instances.ssh_private_key_encrypted IS 'AES-256 encrypted SSH private key';
      COMMENT ON COLUMN oracle.vm_instances.shape IS 'OCI compute shape, e.g., VM.Standard.A1.Flex, VM.Standard.E4.Flex';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS oracle.idx_vm_instances_region;
      DROP INDEX IF EXISTS oracle.idx_vm_instances_lifecycle_state;
      DROP INDEX IF EXISTS oracle.idx_vm_instances_compartment_id;
      DROP INDEX IF EXISTS oracle.idx_vm_instances_instance_id;
      DROP INDEX IF EXISTS oracle.idx_vm_instances_subscription_id;
      DROP INDEX IF EXISTS oracle.idx_vm_instances_user_id;
      DROP TABLE IF EXISTS oracle.vm_instances;
    `);
  }
}
