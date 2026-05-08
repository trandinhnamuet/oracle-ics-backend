import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSystemSshKeysTable20260508100011 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.system_ssh_keys');
    if (tableExists) { console.log('Table oracle.system_ssh_keys already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.system_ssh_keys (
        id SERIAL NOT NULL,
        key_name character varying(100) NOT NULL,
        key_type character varying(20) DEFAULT 'admin' NOT NULL,
        public_key text NOT NULL,
        private_key_encrypted text NOT NULL,
        fingerprint character varying(255),
        algorithm character varying(20) DEFAULT 'RSA',
        key_size integer DEFAULT 4096,
        is_active boolean DEFAULT true,
        description text,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        last_used_at timestamp with time zone,
        usage_count integer DEFAULT 0,
        CONSTRAINT system_ssh_keys_pkey PRIMARY KEY (id),
        CONSTRAINT system_ssh_keys_key_name_key UNIQUE (key_name)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_system_ssh_keys_is_active ON oracle.system_ssh_keys (is_active)`);
    await queryRunner.query(`CREATE INDEX idx_system_ssh_keys_key_name ON oracle.system_ssh_keys (key_name)`);
    await queryRunner.query(`CREATE INDEX idx_system_ssh_keys_key_type ON oracle.system_ssh_keys (key_type)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.system_ssh_keys CASCADE`);
  }
}
