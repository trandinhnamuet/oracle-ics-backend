import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSupportTicketsTable20260303000002 implements MigrationInterface {
  name = 'CreateSupportTicketsTable20260303000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle.support_tickets (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES oracle.users(id) ON DELETE SET NULL,
        title VARCHAR(255) NOT NULL,
        customer_name VARCHAR(150) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(30),
        address VARCHAR(255),
        service VARCHAR(100),
        content TEXT NOT NULL,
        attachment_url VARCHAR(500),
        status VARCHAR(20) NOT NULL DEFAULT 'open',
        priority VARCHAR(20) NOT NULL DEFAULT 'medium',
        admin_note TEXT,
        resolved_by INTEGER,
        resolved_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON oracle.support_tickets(user_id);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON oracle.support_tickets(status);
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_support_tickets_created_at ON oracle.support_tickets(created_at DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.support_tickets CASCADE`);
  }
}
