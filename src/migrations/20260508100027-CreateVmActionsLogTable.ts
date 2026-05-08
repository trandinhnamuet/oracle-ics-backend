import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVmActionsLogTable20260508100027 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.vm_actions_log');
    if (tableExists) { console.log('Table oracle.vm_actions_log already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.vm_actions_log (
        id SERIAL NOT NULL,
        user_id integer NOT NULL,
        action character varying(50) NOT NULL,
        description text,
        metadata jsonb,
        created_at timestamp with time zone DEFAULT now(),
        vm_instance_id integer,
        CONSTRAINT vm_actions_log_pkey PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_vm_actions_log_action ON oracle.vm_actions_log (action)`);
    await queryRunner.query(`CREATE INDEX idx_vm_actions_log_user_id ON oracle.vm_actions_log (user_id)`);
    await queryRunner.query(`CREATE INDEX idx_vm_actions_log_user_id_created_at ON oracle.vm_actions_log (user_id, created_at)`);

    await queryRunner.query(`
      ALTER TABLE oracle.vm_actions_log
        ADD CONSTRAINT fk_vm_actions_log_user
        FOREIGN KEY (user_id) REFERENCES oracle.users(id) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE oracle.vm_actions_log
        ADD CONSTRAINT fk_vm_actions_log_vm_instance
        FOREIGN KEY (vm_instance_id) REFERENCES oracle.vm_instances(id) ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.vm_actions_log CASCADE`);
  }
}
