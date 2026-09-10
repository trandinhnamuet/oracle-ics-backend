import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSiteVisitsTable20260910100001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.site_visits');
    if (tableExists) { console.log('Table oracle.site_visits already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.site_visits (
        id BIGSERIAL NOT NULL,
        visitor_id character varying(64) NOT NULL,
        session_id character varying(64) NOT NULL,
        is_new_visitor boolean DEFAULT false NOT NULL,
        ip character varying(45),
        path character varying(512) NOT NULL,
        title character varying(255),
        referrer character varying(512),
        device character varying(16),
        browser character varying(32),
        os character varying(32),
        screen character varying(16),
        lang character varying(16),
        user_agent character varying(512),
        is_bot boolean DEFAULT false NOT NULL,
        created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
        CONSTRAINT "PK_site_visits_id" PRIMARY KEY (id)
      )
    `);

    // Mọi truy vấn của màn hình thống kê đều lọc theo khoảng thời gian trước,
    // rồi mới gộp theo visitor/path/ip — nên created_at đứng sau trong index ghép.
    await queryRunner.query(`CREATE INDEX "IDX_site_visits_created_at" ON oracle.site_visits (created_at DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_site_visits_visitor_created" ON oracle.site_visits (visitor_id, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_site_visits_session_id" ON oracle.site_visits (session_id)`);
    await queryRunner.query(`CREATE INDEX "IDX_site_visits_path_created" ON oracle.site_visits (path, created_at DESC)`);
    await queryRunner.query(`CREATE INDEX "IDX_site_visits_ip_created" ON oracle.site_visits (ip, created_at DESC)`);
    // Bot bị loại khỏi mọi số liệu, index riêng phần "không phải bot" cho gọn.
    await queryRunner.query(`CREATE INDEX "IDX_site_visits_human_created" ON oracle.site_visits (created_at DESC) WHERE is_bot = false`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.site_visits CASCADE`);
  }
}
