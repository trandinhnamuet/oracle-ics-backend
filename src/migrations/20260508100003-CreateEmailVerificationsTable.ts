import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateEmailVerificationsTable20260508100003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.email_verifications');
    if (tableExists) { console.log('Table oracle.email_verifications already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.email_verifications (
        id SERIAL NOT NULL,
        email character varying(255) NOT NULL,
        otp_code character varying(6) NOT NULL,
        attempt_count integer DEFAULT 0,
        expires_at timestamp with time zone NOT NULL,
        last_resend_at timestamp with time zone,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        CONSTRAINT email_verifications_pkey PRIMARY KEY (id),
        CONSTRAINT email_verifications_email_key UNIQUE (email)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_email_verifications_email ON oracle.email_verifications (email)`);
    await queryRunner.query(`CREATE INDEX idx_email_verifications_expires_at ON oracle.email_verifications (expires_at)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.email_verifications CASCADE`);
  }
}
