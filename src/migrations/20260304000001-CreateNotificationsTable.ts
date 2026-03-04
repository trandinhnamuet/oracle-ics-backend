import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationsTable20260304000001 implements MigrationInterface {
  name = 'CreateNotificationsTable20260304000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle.notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES oracle.users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL DEFAULT 'general',
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        data JSONB,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_id
        ON oracle.notifications(user_id);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_is_read
        ON oracle.notifications(is_read);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_created_at
        ON oracle.notifications(created_at DESC);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
        ON oracle.notifications(user_id, is_read)
        WHERE is_read = FALSE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.notifications CASCADE`);
  }
}
