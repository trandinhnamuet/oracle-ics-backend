import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVmActionsLogTable20251126000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle.vm_actions_log (
        id SERIAL PRIMARY KEY,
        vm_instance_id UUID NOT NULL,
        user_id INTEGER NOT NULL,
        action VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        error_message TEXT,
        requested_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        CONSTRAINT fk_vm_actions_log_vm FOREIGN KEY (vm_instance_id) REFERENCES oracle.vm_instances(id) ON DELETE CASCADE,
        CONSTRAINT fk_vm_actions_log_user FOREIGN KEY (user_id) REFERENCES oracle.users(id) ON DELETE CASCADE
      );
      
      CREATE INDEX IF NOT EXISTS idx_vm_actions_log_vm_instance_id ON oracle.vm_actions_log(vm_instance_id);
      CREATE INDEX IF NOT EXISTS idx_vm_actions_log_user_id ON oracle.vm_actions_log(user_id);
      CREATE INDEX IF NOT EXISTS idx_vm_actions_log_action ON oracle.vm_actions_log(action);
      CREATE INDEX IF NOT EXISTS idx_vm_actions_log_status ON oracle.vm_actions_log(status);
      CREATE INDEX IF NOT EXISTS idx_vm_actions_log_requested_at ON oracle.vm_actions_log(requested_at);
      
      COMMENT ON TABLE oracle.vm_actions_log IS 'Audit log for all VM instance actions (start, stop, restart, etc.)';
      COMMENT ON COLUMN oracle.vm_actions_log.action IS 'Action type: start, stop, restart, reboot, terminate, reset_ssh_key';
      COMMENT ON COLUMN oracle.vm_actions_log.status IS 'Action status: pending, in_progress, success, failed';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS oracle.idx_vm_actions_log_requested_at;
      DROP INDEX IF EXISTS oracle.idx_vm_actions_log_status;
      DROP INDEX IF EXISTS oracle.idx_vm_actions_log_action;
      DROP INDEX IF EXISTS oracle.idx_vm_actions_log_user_id;
      DROP INDEX IF EXISTS oracle.idx_vm_actions_log_vm_instance_id;
      DROP TABLE IF EXISTS oracle.vm_actions_log;
    `);
  }
}
