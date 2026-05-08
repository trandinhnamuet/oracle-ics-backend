import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSupportTicketsTable20260508100021 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.support_tickets');
    if (tableExists) { console.log('Table oracle.support_tickets already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.support_tickets (
        id SERIAL NOT NULL,
        user_id integer,
        title character varying(255) NOT NULL,
        customer_name character varying(150) NOT NULL,
        email character varying(255) NOT NULL,
        phone character varying(30),
        address character varying(255),
        service character varying(100),
        content text NOT NULL,
        attachment_url text,
        status character varying(20) DEFAULT 'open' NOT NULL,
        priority character varying(20) DEFAULT 'medium' NOT NULL,
        admin_note text,
        resolved_by integer,
        resolved_at timestamp with time zone,
        created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        attachments text,
        CONSTRAINT support_tickets_pkey PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_support_tickets_created_at ON oracle.support_tickets (created_at DESC)`);
    await queryRunner.query(`CREATE INDEX idx_support_tickets_status ON oracle.support_tickets (status)`);
    await queryRunner.query(`CREATE INDEX idx_support_tickets_user_id ON oracle.support_tickets (user_id)`);

    await queryRunner.query(`
      ALTER TABLE oracle.support_tickets
        ADD CONSTRAINT support_tickets_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES oracle.users(id) ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.support_tickets CASCADE`);
  }
}
