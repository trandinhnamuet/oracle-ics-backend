import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePageAnalyticsTable20260508100007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.page_analytics');
    if (tableExists) { console.log('Table oracle.page_analytics already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.page_analytics (
        id uuid DEFAULT gen_random_uuid() NOT NULL,
        user_id character varying,
        event_type character varying NOT NULL,
        page_path character varying,
        page_title character varying,
        page_location character varying,
        user_agent text,
        button_name character varying,
        button_label character varying,
        form_name character varying,
        load_time_ms integer,
        scroll_percent integer,
        additional_params jsonb,
        session_id character varying,
        country character varying,
        city character varying,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone,
        CONSTRAINT page_analytics_pkey PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_analytics_created_at" ON oracle.page_analytics (created_at)`);
    await queryRunner.query(`CREATE INDEX "IDX_analytics_event_type_created_at" ON oracle.page_analytics (event_type, created_at)`);
    await queryRunner.query(`CREATE INDEX "IDX_analytics_page_path_created_at" ON oracle.page_analytics (page_path, created_at)`);
    await queryRunner.query(`CREATE INDEX "IDX_analytics_user_id_created_at" ON oracle.page_analytics (user_id, created_at)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.page_analytics CASCADE`);
  }
}
