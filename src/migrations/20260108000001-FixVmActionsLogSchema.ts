import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixVmActionsLogSchema20260108000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old columns that don't match entity
    await queryRunner.query(`
      ALTER TABLE oracle.vm_actions_log 
      DROP COLUMN IF EXISTS status,
      DROP COLUMN IF EXISTS error_message,
      DROP COLUMN IF EXISTS requested_at,
      DROP COLUMN IF EXISTS completed_at;
    `);

    // Add new columns from entity
    await queryRunner.query(`
      ALTER TABLE oracle.vm_actions_log 
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS metadata JSONB,
      ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW();
    `);

    // Drop old indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS oracle.idx_vm_actions_log_status;
      DROP INDEX IF EXISTS oracle.idx_vm_actions_log_requested_at;
    `);

    // Create new indexes to match entity @Index decorators
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_vm_actions_log_vm_instance_id_created_at 
      ON oracle.vm_actions_log(vm_instance_id, created_at);
      
      CREATE INDEX IF NOT EXISTS idx_vm_actions_log_user_id_created_at 
      ON oracle.vm_actions_log(user_id, created_at);
    `);

    // Update comments
    await queryRunner.query(`
      COMMENT ON TABLE oracle.vm_actions_log IS 'Audit log for all VM instance actions';
      COMMENT ON COLUMN oracle.vm_actions_log.action IS 'Action type: CREATE, START, STOP, RESTART, REBOOT, TERMINATE, etc.';
      COMMENT ON COLUMN oracle.vm_actions_log.description IS 'Human-readable description of the action';
      COMMENT ON COLUMN oracle.vm_actions_log.metadata IS 'Additional metadata about the action (JSON)';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert: Drop new columns
    await queryRunner.query(`
      ALTER TABLE oracle.vm_actions_log 
      DROP COLUMN IF EXISTS description,
      DROP COLUMN IF EXISTS metadata,
      DROP COLUMN IF EXISTS created_at;
    `);

    // Revert: Add back old columns
    await queryRunner.query(`
      ALTER TABLE oracle.vm_actions_log 
      ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS error_message TEXT,
      ADD COLUMN IF NOT EXISTS requested_at TIMESTAMP DEFAULT NOW(),
      ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP;
    `);

    // Revert: Drop new indexes
    await queryRunner.query(`
      DROP INDEX IF EXISTS oracle.idx_vm_actions_log_vm_instance_id_created_at;
      DROP INDEX IF EXISTS oracle.idx_vm_actions_log_user_id_created_at;
    `);

    // Revert: Create old indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_vm_actions_log_status 
      ON oracle.vm_actions_log(status);
      
      CREATE INDEX IF NOT EXISTS idx_vm_actions_log_requested_at 
      ON oracle.vm_actions_log(requested_at);
    `);
  }
}
