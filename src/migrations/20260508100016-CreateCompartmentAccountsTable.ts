import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCompartmentAccountsTable20260508100016 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.compartment_accounts');
    if (tableExists) { console.log('Table oracle.compartment_accounts already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.compartment_accounts (
        id SERIAL NOT NULL,
        user_compartment_id integer NOT NULL,
        user_id integer NOT NULL,
        oci_user_id character varying(255) NOT NULL,
        oci_user_name character varying(255) NOT NULL,
        oci_user_email character varying(255),
        oci_user_description text,
        account_type character varying(50) DEFAULT 'read_only' NOT NULL,
        lifecycle_state character varying(50),
        api_key_fingerprint character varying(255),
        can_use_console boolean DEFAULT true,
        can_use_api boolean DEFAULT false,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        last_login_at timestamp with time zone,
        CONSTRAINT compartment_accounts_pkey PRIMARY KEY (id),
        CONSTRAINT uk_compartment_oci_user UNIQUE (user_compartment_id, oci_user_id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_compartment_accounts_account_type ON oracle.compartment_accounts (account_type)`);
    await queryRunner.query(`CREATE INDEX idx_compartment_accounts_compartment_id ON oracle.compartment_accounts (user_compartment_id)`);
    await queryRunner.query(`CREATE INDEX idx_compartment_accounts_oci_user_id ON oracle.compartment_accounts (oci_user_id)`);
    await queryRunner.query(`CREATE INDEX idx_compartment_accounts_user_id ON oracle.compartment_accounts (user_id)`);

    await queryRunner.query(`
      ALTER TABLE oracle.compartment_accounts
        ADD CONSTRAINT fk_compartment_accounts_compartment
        FOREIGN KEY (user_compartment_id) REFERENCES oracle.user_compartments(id) ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE oracle.compartment_accounts
        ADD CONSTRAINT fk_compartment_accounts_user
        FOREIGN KEY (user_id) REFERENCES oracle.users(id) ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.compartment_accounts CASCADE`);
  }
}
