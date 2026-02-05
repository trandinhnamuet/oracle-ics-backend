const { Client } = require('pg');
require('dotenv').config();

async function checkTable() {
  const client = new Client({
    host: 'aws-1-ap-southeast-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.sxlnlxnqhdsrmpjcdpzl',
    password: process.env.DB_PASSWORD,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Check if compartment_accounts table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'oracle' 
        AND table_name = 'compartment_accounts'
      );
    `);

    const tableExists = tableCheck.rows[0].exists;
    console.log(`Table oracle.compartment_accounts exists: ${tableExists ? '✅ YES' : '❌ NO'}`);

    if (tableExists) {
      // Check table structure
      console.log('\n📊 Table structure:');
      const columns = await client.query(`
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema = 'oracle' AND table_name = 'compartment_accounts'
        ORDER BY ordinal_position;
      `);
      
      console.table(columns.rows);

      // Check data
      const count = await client.query(`SELECT COUNT(*) FROM oracle.compartment_accounts`);
      console.log(`\n📈 Total records: ${count.rows[0].count}`);

      if (parseInt(count.rows[0].count) > 0) {
        const sample = await client.query(`SELECT * FROM oracle.compartment_accounts LIMIT 5`);
        console.log('\n📋 Sample data:');
        console.table(sample.rows);
      }
    } else {
      console.log('\n❌ Table does not exist! Creating it now...\n');
      
      // Create table
      await client.query(`
        CREATE TABLE IF NOT EXISTS oracle.compartment_accounts (
          id SERIAL PRIMARY KEY,
          compartment_id INT NOT NULL,
          user_ocid VARCHAR(255) NOT NULL UNIQUE,
          username VARCHAR(255) NOT NULL,
          description TEXT,
          status VARCHAR(50) DEFAULT 'ACTIVE',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Create index
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_compartment_accounts_compartment_status 
        ON oracle.compartment_accounts(compartment_id, status);
      `);

      console.log('✅ Table created successfully!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

checkTable();
