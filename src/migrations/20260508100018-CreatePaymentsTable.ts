import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaymentsTable20260508100018 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.payments');
    if (tableExists) { console.log('Table oracle.payments already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION oracle.update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    await queryRunner.query(`
      CREATE TABLE oracle.payments (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        user_id integer NOT NULL,
        amount numeric(18,6) NOT NULL,
        subscription_id uuid,
        cloud_package_id integer,
        payment_method character varying(50),
        payment_type character varying(50),
        transaction_code character varying(100),
        status character varying(50),
        description text,
        metadata json,
        created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
        updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
        completed_at timestamp with time zone,
        CONSTRAINT payments_pkey PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_payments_cloud_package_id ON oracle.payments (cloud_package_id)`);
    await queryRunner.query(`CREATE INDEX idx_payments_status ON oracle.payments (status)`);
    await queryRunner.query(`CREATE INDEX idx_payments_subscription_id ON oracle.payments (subscription_id)`);
    await queryRunner.query(`CREATE INDEX idx_payments_transaction_code ON oracle.payments (transaction_code)`);
    await queryRunner.query(`CREATE INDEX idx_payments_user_id ON oracle.payments (user_id)`);

    await queryRunner.query(`
      CREATE TRIGGER update_payments_updated_at
        BEFORE UPDATE ON oracle.payments
        FOR EACH ROW EXECUTE FUNCTION oracle.update_updated_at_column()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.payments CASCADE`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS oracle.update_updated_at_column()`);
  }
}
