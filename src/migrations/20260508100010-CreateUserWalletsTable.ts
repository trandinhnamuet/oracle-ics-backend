import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserWalletsTable20260508100010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.user_wallets');
    if (tableExists) { console.log('Table oracle.user_wallets already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.user_wallets (
        id SERIAL NOT NULL,
        user_id integer NOT NULL,
        balance numeric(18,6) DEFAULT 0,
        currency character varying(10) DEFAULT 'VND',
        last_payment_id uuid,
        status character varying(20),
        is_active boolean DEFAULT true NOT NULL,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        CONSTRAINT user_wallets_pkey PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_user_wallets_last_payment_id ON oracle.user_wallets (last_payment_id)`);
    await queryRunner.query(`CREATE INDEX idx_user_wallets_status ON oracle.user_wallets (status)`);
    await queryRunner.query(`CREATE INDEX idx_user_wallets_user_id ON oracle.user_wallets (user_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.user_wallets CASCADE`);
  }
}
