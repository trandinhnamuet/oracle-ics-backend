import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationsTable20260508100022 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.notifications');
    if (tableExists) { console.log('Table oracle.notifications already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.notifications (
        id SERIAL NOT NULL,
        user_id integer NOT NULL,
        type character varying(50) DEFAULT 'general' NOT NULL,
        title character varying(255) NOT NULL,
        message text NOT NULL,
        data jsonb,
        is_read boolean DEFAULT false NOT NULL,
        created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        title_en character varying(255),
        message_en text,
        CONSTRAINT notifications_pkey PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_notifications_created_at ON oracle.notifications (created_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_notifications_is_read ON oracle.notifications (is_read)`);
    await queryRunner.query(`CREATE INDEX idx_notifications_user_id ON oracle.notifications (user_id)`);
    await queryRunner.query(`CREATE INDEX idx_notifications_user_unread ON oracle.notifications (user_id, is_read) WHERE is_read = false`);

    await queryRunner.query(`
      ALTER TABLE oracle.notifications
        ADD CONSTRAINT notifications_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES oracle.users(id) ON DELETE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.notifications CASCADE`);
  }
}
