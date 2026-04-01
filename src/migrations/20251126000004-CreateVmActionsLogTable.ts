import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVmActionsLogTable20251126000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tạo bảng nếu chưa tồn tại (không có cột status để tương thích bảng cũ)
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle.vm_actions_log (
        id SERIAL PRIMARY KEY,
        vm_instance_id UUID NOT NULL,
        user_id INTEGER NOT NULL,
        action VARCHAR(50) NOT NULL,
        error_message TEXT,
        requested_at TIMESTAMP DEFAULT NOW(),
        completed_at TIMESTAMP,
        CONSTRAINT fk_vm_actions_log_vm FOREIGN KEY (vm_instance_id) REFERENCES oracle.vm_instances(id) ON DELETE CASCADE,
        CONSTRAINT fk_vm_actions_log_user FOREIGN KEY (user_id) REFERENCES oracle.users(id) ON DELETE CASCADE
      );
    `);

    // Thêm cột status nếu chưa có (an toàn khi bảng đã tồn tại từ phiên bản cũ)
    await queryRunner.query(`
      ALTER TABLE oracle.vm_actions_log
        ADD COLUMN IF NOT EXISTS status VARCHAR(50) NOT NULL DEFAULT 'pending';
    `);

    // Tạo các index riêng lẻ (tránh lỗi khi gộp chung với CREATE TABLE)
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_vm_actions_log_vm_instance_id ON oracle.vm_actions_log(vm_instance_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_vm_actions_log_user_id ON oracle.vm_actions_log(user_id);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_vm_actions_log_action ON oracle.vm_actions_log(action);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_vm_actions_log_status ON oracle.vm_actions_log(status);`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_vm_actions_log_requested_at ON oracle.vm_actions_log(requested_at);`);

    await queryRunner.query(`COMMENT ON TABLE oracle.vm_actions_log IS 'Audit log for all VM instance actions (start, stop, restart, etc.)';`);
    await queryRunner.query(`COMMENT ON COLUMN oracle.vm_actions_log.action IS 'Action type: start, stop, restart, reboot, terminate, reset_ssh_key';`);
    await queryRunner.query(`COMMENT ON COLUMN oracle.vm_actions_log.status IS 'Action status: pending, in_progress, success, failed';`);
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
