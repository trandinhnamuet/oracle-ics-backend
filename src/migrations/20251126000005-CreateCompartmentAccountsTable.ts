import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCompartmentAccountsTable20251126000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS oracle.compartment_accounts (
        id SERIAL PRIMARY KEY,
        user_compartment_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        oci_user_id VARCHAR(255) NOT NULL,
        oci_user_name VARCHAR(255) NOT NULL,
        oci_user_email VARCHAR(255),
        oci_user_description TEXT,
        account_type VARCHAR(50) NOT NULL DEFAULT 'read_only',
        lifecycle_state VARCHAR(50),
        api_key_fingerprint VARCHAR(255),
        can_use_console BOOLEAN DEFAULT true,
        can_use_api BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        last_login_at TIMESTAMP,
        CONSTRAINT fk_compartment_accounts_compartment FOREIGN KEY (user_compartment_id) REFERENCES oracle.user_compartments(id) ON DELETE CASCADE,
        CONSTRAINT fk_compartment_accounts_user FOREIGN KEY (user_id) REFERENCES oracle.users(id) ON DELETE CASCADE,
        CONSTRAINT uk_compartment_oci_user UNIQUE (user_compartment_id, oci_user_id)
      );
      
      CREATE INDEX IF NOT EXISTS idx_compartment_accounts_compartment_id ON oracle.compartment_accounts(user_compartment_id);
      CREATE INDEX IF NOT EXISTS idx_compartment_accounts_user_id ON oracle.compartment_accounts(user_id);
      CREATE INDEX IF NOT EXISTS idx_compartment_accounts_oci_user_id ON oracle.compartment_accounts(oci_user_id);
      CREATE INDEX IF NOT EXISTS idx_compartment_accounts_account_type ON oracle.compartment_accounts(account_type);
      
      COMMENT ON TABLE oracle.compartment_accounts IS 'Stores OCI IAM user accounts created for users to access their compartments';
      COMMENT ON COLUMN oracle.compartment_accounts.oci_user_id IS 'OCID of the OCI IAM user';
      COMMENT ON COLUMN oracle.compartment_accounts.account_type IS 'Account permission level: read_only, power_user, admin';
      COMMENT ON COLUMN oracle.compartment_accounts.lifecycle_state IS 'OCI user lifecycle state: ACTIVE, INACTIVE, DELETING, DELETED';
      COMMENT ON COLUMN oracle.compartment_accounts.api_key_fingerprint IS 'Fingerprint of the API signing key for programmatic access';
      COMMENT ON COLUMN oracle.compartment_accounts.can_use_console IS 'Whether user can log into OCI web console';
      COMMENT ON COLUMN oracle.compartment_accounts.can_use_api IS 'Whether user can use OCI APIs with API keys';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS oracle.idx_compartment_accounts_account_type;
      DROP INDEX IF EXISTS oracle.idx_compartment_accounts_oci_user_id;
      DROP INDEX IF EXISTS oracle.idx_compartment_accounts_user_id;
      DROP INDEX IF EXISTS oracle.idx_compartment_accounts_compartment_id;
      DROP TABLE IF EXISTS oracle.compartment_accounts;
    `);
  }
}
