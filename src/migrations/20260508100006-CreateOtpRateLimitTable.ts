import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOtpRateLimitTable20260508100006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.otp_rate_limit');
    if (tableExists) { console.log('Table oracle.otp_rate_limit already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.otp_rate_limit (
        id SERIAL NOT NULL,
        email character varying(255) NOT NULL,
        sent_at timestamp with time zone DEFAULT now() NOT NULL,
        CONSTRAINT otp_rate_limit_pkey PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_otp_rate_limit_email_sent ON oracle.otp_rate_limit (email, sent_at)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.otp_rate_limit CASCADE`);
  }
}
