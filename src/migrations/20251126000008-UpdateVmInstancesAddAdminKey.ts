import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateVmInstancesAddAdminKey20251126000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- Add column to track which admin key is used
      ALTER TABLE oracle.vm_instances 
        ADD COLUMN IF NOT EXISTS system_ssh_key_id INTEGER,
        ADD COLUMN IF NOT EXISTS has_admin_access BOOLEAN DEFAULT true;
      
      -- Add foreign key constraint
      ALTER TABLE oracle.vm_instances 
        ADD CONSTRAINT fk_vm_instances_system_ssh_key 
        FOREIGN KEY (system_ssh_key_id) 
        REFERENCES oracle.system_ssh_keys(id) 
        ON DELETE SET NULL;
      
      -- Create index
      CREATE INDEX IF NOT EXISTS idx_vm_instances_system_ssh_key_id ON oracle.vm_instances(system_ssh_key_id);
      
      -- Add comments
      COMMENT ON COLUMN oracle.vm_instances.system_ssh_key_id IS 'Reference to the system SSH key used for admin/web terminal access';
      COMMENT ON COLUMN oracle.vm_instances.has_admin_access IS 'Whether system has SSH access to this VM (for web terminal)';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS oracle.idx_vm_instances_system_ssh_key_id;
      
      ALTER TABLE oracle.vm_instances 
        DROP CONSTRAINT IF EXISTS fk_vm_instances_system_ssh_key;
      
      ALTER TABLE oracle.vm_instances 
        DROP COLUMN IF EXISTS has_admin_access,
        DROP COLUMN IF EXISTS system_ssh_key_id;
    `);
  }
}
