import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVmInstancesTable20260508100014 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.vm_instances');
    if (tableExists) { console.log('Table oracle.vm_instances already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.vm_instances (
        id SERIAL NOT NULL,
        subscription_id uuid NOT NULL,
        user_id integer NOT NULL,
        compartment_id character varying(255) NOT NULL,
        instance_id character varying(255) NOT NULL,
        instance_name character varying(255) NOT NULL,
        shape character varying(100),
        image_id character varying(255),
        image_name character varying(255),
        operating_system character varying(100),
        region character varying(50),
        availability_domain character varying(100),
        public_ip character varying(50),
        private_ip character varying(50),
        vcn_id character varying(255),
        subnet_id character varying(255),
        lifecycle_state character varying(50),
        ssh_public_key text,
        ssh_private_key_encrypted text,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        system_ssh_key_id integer,
        has_admin_access boolean DEFAULT true,
        vm_started_at timestamp with time zone,
        windows_initial_password text,
        vnic_id character varying(500),
        operating_system_version character varying(100),
        windows_password_initialized boolean DEFAULT false NOT NULL,
        windows_current_password text,
        CONSTRAINT vm_instances_pkey PRIMARY KEY (id),
        CONSTRAINT uk_subscription_vm UNIQUE (subscription_id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_vm_instances_compartment_id ON oracle.vm_instances (compartment_id)`);
    await queryRunner.query(`CREATE INDEX idx_vm_instances_instance_id ON oracle.vm_instances (instance_id)`);
    await queryRunner.query(`CREATE INDEX idx_vm_instances_lifecycle_state ON oracle.vm_instances (lifecycle_state)`);
    await queryRunner.query(`CREATE INDEX idx_vm_instances_region ON oracle.vm_instances (region)`);
    await queryRunner.query(`CREATE INDEX idx_vm_instances_subscription_id ON oracle.vm_instances (subscription_id)`);
    await queryRunner.query(`CREATE INDEX idx_vm_instances_system_ssh_key_id ON oracle.vm_instances (system_ssh_key_id)`);
    await queryRunner.query(`CREATE INDEX idx_vm_instances_user_id ON oracle.vm_instances (user_id)`);
    await queryRunner.query(`CREATE INDEX idx_vm_instances_vnic_id ON oracle.vm_instances (vnic_id) WHERE vnic_id IS NOT NULL`);

    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances
        ADD CONSTRAINT fk_vm_instances_subscription
        FOREIGN KEY (subscription_id) REFERENCES oracle.subscriptions(id) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances
        ADD CONSTRAINT fk_vm_instances_user
        FOREIGN KEY (user_id) REFERENCES oracle.users(id) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE oracle.vm_instances
        ADD CONSTRAINT fk_vm_instances_system_ssh_key
        FOREIGN KEY (system_ssh_key_id) REFERENCES oracle.system_ssh_keys(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.vm_instances CASCADE`);
  }
}
