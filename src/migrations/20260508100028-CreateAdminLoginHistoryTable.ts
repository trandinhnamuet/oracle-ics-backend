import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAdminLoginHistoryTable20260508100028 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.admin_login_history');
    if (tableExists) { console.log('Table oracle.admin_login_history already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.admin_login_history (
        id SERIAL NOT NULL,
        admin_id integer,
        username character varying(255) NOT NULL,
        role character varying(50) DEFAULT 'admin' NOT NULL,
        login_time timestamp with time zone NOT NULL,
        login_status character varying(50) NOT NULL,
        ip_v4 character varying(45),
        ip_v6 character varying(45),
        country character varying(100),
        city character varying(100),
        isp character varying(100),
        browser character varying(100),
        os character varying(100),
        device_type character varying(50),
        user_agent text,
        "2fa_status" character varying(50),
        session_id character varying(255),
        is_new_device boolean DEFAULT false NOT NULL,
        logout_time timestamp with time zone,
        session_duration_minutes integer,
        failed_attempts_before_success integer DEFAULT 0 NOT NULL,
        created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT "PK_d37fa945303e6da601b0793b8cf" PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_admin_login_history_admin_id" ON oracle.admin_login_history (admin_id)`);
    await queryRunner.query(`CREATE INDEX "IDX_admin_login_history_login_time" ON oracle.admin_login_history (login_time)`);
    await queryRunner.query(`CREATE INDEX "IDX_admin_login_history_session_id" ON oracle.admin_login_history (session_id)`);
    await queryRunner.query(`CREATE INDEX "IDX_admin_login_history_status" ON oracle.admin_login_history (login_status)`);

    await queryRunner.query(`
      ALTER TABLE oracle.admin_login_history
        ADD CONSTRAINT "FK_admin_login_history_user_id"
        FOREIGN KEY (admin_id) REFERENCES oracle.users(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.admin_login_history CASCADE`);
  }
}
