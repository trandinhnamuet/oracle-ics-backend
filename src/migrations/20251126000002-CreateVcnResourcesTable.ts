import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVcnResourcesTable20251126000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle.vcn_resources (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        compartment_id VARCHAR(255) NOT NULL,
        vcn_id VARCHAR(255) NOT NULL,
        vcn_name VARCHAR(255),
        cidr_block VARCHAR(50),
        subnet_id VARCHAR(255),
        subnet_name VARCHAR(255),
        internet_gateway_id VARCHAR(255),
        route_table_id VARCHAR(255),
        security_list_id VARCHAR(255),
        region VARCHAR(50),
        lifecycle_state VARCHAR(50),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        CONSTRAINT fk_vcn_resources_user FOREIGN KEY (user_id) REFERENCES oracle.users(id) ON DELETE CASCADE,
        CONSTRAINT uk_user_compartment_vcn UNIQUE (user_id, compartment_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_vcn_resources_user_id ON oracle.vcn_resources(user_id);
      CREATE INDEX IF NOT EXISTS idx_vcn_resources_compartment_id ON oracle.vcn_resources(compartment_id);
      CREATE INDEX IF NOT EXISTS idx_vcn_resources_vcn_id ON oracle.vcn_resources(vcn_id);
      CREATE INDEX IF NOT EXISTS idx_vcn_resources_region ON oracle.vcn_resources(region);
      
      COMMENT ON TABLE oracle.vcn_resources IS 'Stores OCI VCN and network resources for each user compartment';
      COMMENT ON COLUMN oracle.vcn_resources.vcn_id IS 'OCID of the OCI Virtual Cloud Network';
      COMMENT ON COLUMN oracle.vcn_resources.subnet_id IS 'OCID of the public subnet';
      COMMENT ON COLUMN oracle.vcn_resources.cidr_block IS 'VCN CIDR block, default: 10.0.0.0/16';
      COMMENT ON COLUMN oracle.vcn_resources.lifecycle_state IS 'OCI VCN lifecycle state: AVAILABLE, TERMINATING, TERMINATED';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS oracle.idx_vcn_resources_region;
      DROP INDEX IF EXISTS oracle.idx_vcn_resources_vcn_id;
      DROP INDEX IF EXISTS oracle.idx_vcn_resources_compartment_id;
      DROP INDEX IF EXISTS oracle.idx_vcn_resources_user_id;
      DROP TABLE IF EXISTS oracle.vcn_resources;
    `);
  }
}
