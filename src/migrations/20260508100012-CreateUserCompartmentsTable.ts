import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserCompartmentsTable20260508100012 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.user_compartments');
    if (tableExists) { console.log('Table oracle.user_compartments already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.user_compartments (
        id SERIAL NOT NULL,
        user_id integer NOT NULL,
        compartment_id character varying(255) NOT NULL,
        compartment_name character varying(255) NOT NULL,
        region character varying(50) NOT NULL,
        lifecycle_state character varying(50),
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        CONSTRAINT user_compartments_pkey PRIMARY KEY (id),
        CONSTRAINT uk_user_compartment_region UNIQUE (user_id, region)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_user_compartments_compartment_id ON oracle.user_compartments (compartment_id)`);
    await queryRunner.query(`CREATE INDEX idx_user_compartments_region ON oracle.user_compartments (region)`);
    await queryRunner.query(`CREATE INDEX idx_user_compartments_user_id ON oracle.user_compartments (user_id)`);

    await queryRunner.query(`
      ALTER TABLE oracle.user_compartments
        ADD CONSTRAINT fk_user_compartments_user
        FOREIGN KEY (user_id) REFERENCES oracle.users(id) ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.user_compartments CASCADE`);
  }
}
