import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateActionOtpVerificationsTable20260508100024 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.action_otp_verifications');
    if (tableExists) { console.log('Table oracle.action_otp_verifications already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.action_otp_verifications (
        id SERIAL NOT NULL,
        user_id integer NOT NULL,
        subscription_id uuid NOT NULL,
        action character varying(32) NOT NULL,
        otp_code character varying(6) NOT NULL,
        expires_at timestamp with time zone NOT NULL,
        used_at timestamp with time zone,
        sent_at timestamp with time zone NOT NULL,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        CONSTRAINT action_otp_verifications_pkey PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_action_otp_code_active ON oracle.action_otp_verifications (user_id, subscription_id, action, otp_code, used_at)`);
    await queryRunner.query(`CREATE INDEX idx_action_otp_expires_at ON oracle.action_otp_verifications (expires_at)`);
    await queryRunner.query(`CREATE INDEX idx_action_otp_key_active ON oracle.action_otp_verifications (user_id, subscription_id, action, used_at)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.action_otp_verifications CASCADE`);
  }
}
