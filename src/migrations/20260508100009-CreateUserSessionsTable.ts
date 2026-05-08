import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserSessionsTable20260508100009 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.user_sessions');
    if (tableExists) { console.log('Table oracle.user_sessions already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.user_sessions (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        "userId" character varying NOT NULL,
        "refreshTokenHash" text NOT NULL,
        "userAgent" character varying(500),
        "ipAddress" character varying(100),
        "expiresAt" timestamp with time zone NOT NULL,
        "createdAt" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT user_sessions_pkey PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_user_sessions_expiresAt" ON oracle.user_sessions ("expiresAt")`);
    await queryRunner.query(`CREATE INDEX "IDX_user_sessions_userId" ON oracle.user_sessions ("userId")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.user_sessions CASCADE`);
  }
}
