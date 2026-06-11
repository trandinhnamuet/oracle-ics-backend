import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable20260508100001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.users');
    if (tableExists) { console.log('Table oracle.users already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.users (
        id SERIAL NOT NULL,
        email character varying(255) NOT NULL,
        first_name character varying(255) NOT NULL,
        last_name character varying(255) NOT NULL,
        is_active boolean DEFAULT false,
        phone_number character varying(20),
        company character varying(255),
        role character varying(20) DEFAULT 'customer' NOT NULL,
        avatar_url character varying(500),
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        email_verification_otp character varying(6),
        otp_expires_at timestamp with time zone,
        password_reset_otp character varying(6),
        password_reset_otp_expires_at timestamp with time zone,
        refresh_token character varying(500),
        refresh_token_expires_at timestamp with time zone,
        google_id character varying(255),
        auth_provider character varying(50) DEFAULT 'local' NOT NULL,
        password character varying(255),
        gender character varying(10),
        id_card character varying(20),
        backup_email character varying(255),
        address character varying(500),
        CONSTRAINT users_pkey PRIMARY KEY (id),
        CONSTRAINT users_email_key UNIQUE (email),
        CONSTRAINT "UQ_0bd5012aeb82628e07f6a1be53b" UNIQUE (google_id)
      )
    `);

    await queryRunner.query(
      `CREATE UNIQUE INDEX idx_users_google_id ON oracle.users (google_id) WHERE google_id IS NOT NULL`
    );

    const adminPasswordHash = process.env.ADMIN_INITIAL_PASSWORD_HASH;
    if (!adminPasswordHash) throw new Error('ADMIN_INITIAL_PASSWORD_HASH env var required for migration');
    await queryRunner.query(
      `INSERT INTO oracle.users (email, password, first_name, last_name, is_active, role, auth_provider)
       VALUES ('admin@ics.com', $1, 'ICS', 'Admin', true, 'admin', 'local')`,
      [adminPasswordHash]
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.users CASCADE`);
  }
}
