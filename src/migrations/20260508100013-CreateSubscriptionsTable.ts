import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSubscriptionsTable20260508100013 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.subscriptions');
    if (tableExists) { console.log('Table oracle.subscriptions already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.subscriptions (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        user_id integer NOT NULL,
        cloud_package_id integer NOT NULL,
        start_date timestamp with time zone NOT NULL,
        end_date timestamp with time zone NOT NULL,
        status character varying(20),
        auto_renew boolean DEFAULT true,
        amount_paid numeric(15,2) DEFAULT 0,
        months_paid integer DEFAULT 1,
        configuration json,
        notes text,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        configuration_status character varying(50) DEFAULT 'pending_setup',
        last_configured_at timestamp with time zone,
        provisioning_error text,
        vm_instance_id integer,
        CONSTRAINT subscriptions_pkey PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_subscriptions_cloud_package_id ON oracle.subscriptions (cloud_package_id)`);
    await queryRunner.query(`CREATE INDEX idx_subscriptions_configuration_status ON oracle.subscriptions (configuration_status)`);
    await queryRunner.query(`CREATE INDEX idx_subscriptions_end_date ON oracle.subscriptions (end_date)`);
    await queryRunner.query(`CREATE INDEX idx_subscriptions_start_date ON oracle.subscriptions (start_date)`);
    await queryRunner.query(`CREATE INDEX idx_subscriptions_status ON oracle.subscriptions (status)`);
    await queryRunner.query(`CREATE INDEX idx_subscriptions_user_id ON oracle.subscriptions (user_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.subscriptions CASCADE`);
  }
}
