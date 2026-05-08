import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBandwidthMonthlySnapshotsTable20260508100026 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.bandwidth_monthly_snapshots');
    if (tableExists) { console.log('Table oracle.bandwidth_monthly_snapshots already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.bandwidth_monthly_snapshots (
        id SERIAL NOT NULL,
        vm_instance_id integer,
        instance_id character varying(500) NOT NULL,
        instance_name character varying(255) NOT NULL,
        user_id integer NOT NULL,
        subscription_id uuid,
        year_month character(7) NOT NULL,
        bytes_out_total numeric(20,0) DEFAULT 0,
        bytes_in_total numeric(20,0) DEFAULT 0,
        data_source character varying(20) DEFAULT 'oci',
        recorded_at timestamp with time zone DEFAULT now(),
        compartment_id character varying(500),
        CONSTRAINT bandwidth_monthly_snapshots_pkey PRIMARY KEY (id),
        CONSTRAINT uq_bw_snapshot_vm_month UNIQUE (instance_id, year_month)
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_bandwidth_snapshots_compartment_month" ON oracle.bandwidth_monthly_snapshots (compartment_id, year_month)`);
    await queryRunner.query(`CREATE INDEX idx_bw_snapshot_instance_month ON oracle.bandwidth_monthly_snapshots (instance_id, year_month)`);
    await queryRunner.query(`CREATE INDEX idx_bw_snapshot_user_month ON oracle.bandwidth_monthly_snapshots (user_id, year_month)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.bandwidth_monthly_snapshots CASCADE`);
  }
}
