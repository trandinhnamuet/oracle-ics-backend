import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCustomPackageRegistrationsTable20260508100008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('oracle.custom_package_registrations');
    if (tableExists) { console.log('Table oracle.custom_package_registrations already exists, skipping'); return; }

    await queryRunner.query(`
      CREATE TABLE oracle.custom_package_registrations (
        id SERIAL NOT NULL,
        user_id integer,
        phone_number character varying(20) NOT NULL,
        email character varying(255) NOT NULL,
        company character varying(255),
        detail text,
        processed boolean DEFAULT false,
        created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
        created_by character varying(255),
        CONSTRAINT custom_package_registrations_pkey PRIMARY KEY (id)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS oracle.custom_package_registrations CASCADE`);
  }
}
