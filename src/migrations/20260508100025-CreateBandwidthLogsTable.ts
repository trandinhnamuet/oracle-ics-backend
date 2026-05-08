import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBandwidthLogsTable20260508100025 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.bandwidth_logs');
    if (tableExists) { console.log('Table oracle.bandwidth_logs already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.bandwidth_logs (
        id SERIAL NOT NULL,
        vm_instance_id integer NOT NULL,
        user_id integer NOT NULL,
        subscription_id uuid,
        instance_id character varying(255) NOT NULL,
        instance_name character varying(255) NOT NULL,
        lifecycle_state character varying(50),
        bytes_in numeric(20,0) DEFAULT 0,
        bytes_out numeric(20,0) DEFAULT 0,
        total_bytes numeric(20,0) DEFAULT 0,
        recorded_at timestamp without time zone NOT NULL,
        created_at timestamp without time zone DEFAULT now(),
        CONSTRAINT bandwidth_logs_pkey PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_bandwidth_logs_recorded ON oracle.bandwidth_logs (recorded_at)`);
    await queryRunner.query(`CREATE INDEX idx_bandwidth_logs_user_recorded ON oracle.bandwidth_logs (user_id, recorded_at)`);
    await queryRunner.query(`CREATE INDEX idx_bandwidth_logs_vm_recorded ON oracle.bandwidth_logs (vm_instance_id, recorded_at)`);

    await queryRunner.query(`
      ALTER TABLE oracle.bandwidth_logs
        ADD CONSTRAINT fk_bandwidth_logs_user
        FOREIGN KEY (user_id) REFERENCES oracle.users(id) ON DELETE SET NULL
    `);
    await queryRunner.query(`
      ALTER TABLE oracle.bandwidth_logs
        ADD CONSTRAINT fk_bandwidth_logs_vm
        FOREIGN KEY (vm_instance_id) REFERENCES oracle.vm_instances(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.bandwidth_logs CASCADE`);
  }
}
