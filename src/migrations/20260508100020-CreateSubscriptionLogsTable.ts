import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSubscriptionLogsTable20260508100020 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.subscription_logs');
    if (tableExists) { console.log('Table oracle.subscription_logs already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.subscription_logs (
        id SERIAL NOT NULL,
        subscription_id uuid NOT NULL,
        user_id integer NOT NULL,
        action character varying(20),
        status_old character varying(100),
        status_new character varying(100),
        created_at timestamp with time zone DEFAULT now(),
        description text,
        metadata json,
        CONSTRAINT subscription_logs_pkey PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_subscription_logs_action ON oracle.subscription_logs (action)`);
    await queryRunner.query(`CREATE INDEX idx_subscription_logs_created_at ON oracle.subscription_logs (created_at)`);
    await queryRunner.query(`CREATE INDEX idx_subscription_logs_subscription_id ON oracle.subscription_logs (subscription_id)`);
    await queryRunner.query(`CREATE INDEX idx_subscription_logs_user_id ON oracle.subscription_logs (user_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.subscription_logs CASCADE`);
  }
}
