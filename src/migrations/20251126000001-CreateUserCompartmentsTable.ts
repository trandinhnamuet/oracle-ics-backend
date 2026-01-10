import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserCompartmentsTable20251126000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle.user_compartments (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        compartment_id VARCHAR(255) NOT NULL,
        compartment_name VARCHAR(255) NOT NULL,
        region VARCHAR(50) NOT NULL,
        lifecycle_state VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_user_compartments_user FOREIGN KEY (user_id) REFERENCES oracle.users(id) ON DELETE CASCADE,
        CONSTRAINT uk_user_compartment_region UNIQUE (user_id, region)
      );
      
      CREATE INDEX IF NOT EXISTS idx_user_compartments_user_id ON oracle.user_compartments(user_id);
      CREATE INDEX IF NOT EXISTS idx_user_compartments_compartment_id ON oracle.user_compartments(compartment_id);
      CREATE INDEX IF NOT EXISTS idx_user_compartments_region ON oracle.user_compartments(region);
      
      COMMENT ON TABLE oracle.user_compartments IS 'Stores OCI compartments created for each user';
      COMMENT ON COLUMN oracle.user_compartments.compartment_id IS 'OCID of the OCI compartment';
      COMMENT ON COLUMN oracle.user_compartments.lifecycle_state IS 'OCI compartment lifecycle state: ACTIVE, INACTIVE, DELETING, DELETED';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS oracle.idx_user_compartments_region;
      DROP INDEX IF EXISTS oracle.idx_user_compartments_compartment_id;
      DROP INDEX IF EXISTS oracle.idx_user_compartments_user_id;
      DROP TABLE IF EXISTS oracle.user_compartments;
    `);
  }
}
