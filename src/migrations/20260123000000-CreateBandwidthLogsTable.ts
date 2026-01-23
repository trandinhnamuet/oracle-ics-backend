import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBandwidthLogsTable1674325000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle.bandwidth_logs (
        id SERIAL PRIMARY KEY,
        vm_instance_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        subscription_id UUID,
        instance_id VARCHAR(255) NOT NULL,
        instance_name VARCHAR(255) NOT NULL,
        lifecycle_state VARCHAR(50),
        bytes_in NUMERIC(20, 0) DEFAULT 0,
        bytes_out NUMERIC(20, 0) DEFAULT 0,
        total_bytes NUMERIC(20, 0) DEFAULT 0,
        recorded_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_bandwidth_logs_vm FOREIGN KEY (vm_instance_id) 
          REFERENCES oracle.vm_instances(id) ON DELETE SET NULL,
        CONSTRAINT fk_bandwidth_logs_user FOREIGN KEY (user_id) 
          REFERENCES oracle.users(id) ON DELETE SET NULL
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bandwidth_logs_vm_recorded 
      ON oracle.bandwidth_logs(vm_instance_id, recorded_at)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bandwidth_logs_user_recorded 
      ON oracle.bandwidth_logs(user_id, recorded_at)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_bandwidth_logs_recorded 
      ON oracle.bandwidth_logs(recorded_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS oracle.idx_bandwidth_logs_vm_recorded`);
    await queryRunner.query(`DROP INDEX IF EXISTS oracle.idx_bandwidth_logs_user_recorded`);
    await queryRunner.query(`DROP INDEX IF EXISTS oracle.idx_bandwidth_logs_recorded`);

    // Drop table
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.bandwidth_logs`);
  }
}
