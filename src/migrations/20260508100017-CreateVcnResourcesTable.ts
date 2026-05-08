import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVcnResourcesTable20260508100017 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.vcn_resources');
    if (tableExists) { console.log('Table oracle.vcn_resources already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.vcn_resources (
        id SERIAL NOT NULL,
        user_id integer NOT NULL,
        compartment_id character varying(255) NOT NULL,
        vcn_id character varying(255) NOT NULL,
        vcn_name character varying(255),
        cidr_block character varying(50),
        subnet_id character varying(255),
        subnet_name character varying(255),
        internet_gateway_id character varying(255),
        route_table_id character varying(255),
        security_list_id character varying(255),
        region character varying(50),
        lifecycle_state character varying(50),
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        CONSTRAINT vcn_resources_pkey PRIMARY KEY (id),
        CONSTRAINT uk_user_compartment_vcn UNIQUE (user_id, compartment_id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_vcn_resources_compartment_id ON oracle.vcn_resources (compartment_id)`);
    await queryRunner.query(`CREATE INDEX idx_vcn_resources_region ON oracle.vcn_resources (region)`);
    await queryRunner.query(`CREATE INDEX idx_vcn_resources_user_id ON oracle.vcn_resources (user_id)`);
    await queryRunner.query(`CREATE INDEX idx_vcn_resources_vcn_id ON oracle.vcn_resources (vcn_id)`);

    await queryRunner.query(`
      ALTER TABLE oracle.vcn_resources
        ADD CONSTRAINT fk_vcn_resources_user
        FOREIGN KEY (user_id) REFERENCES oracle.users(id) ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.vcn_resources CASCADE`);
  }
}
