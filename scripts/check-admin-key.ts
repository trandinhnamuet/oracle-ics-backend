import { config } from 'dotenv';
import { Client } from 'pg';

config();

async function checkAdminKey() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'postgres',
  });

  try {
    await client.connect();
    console.log('📊 Admin Keys in Database:\n');

    const result = await client.query(
      `SELECT id, key_name, fingerprint, is_active, 
              LEFT(public_key, 80) as public_key_preview,
              LEFT(private_key_encrypted, 50) as encrypted_preview,
              created_at, updated_at
       FROM oracle.system_ssh_keys 
       WHERE key_type = 'admin' 
       ORDER BY id`
    );

    result.rows.forEach(row => {
      console.log('ID:', row.id);
      console.log('Name:', row.key_name);
      console.log('Fingerprint:', row.fingerprint);
      console.log('Active:', row.is_active);
      console.log('Public Key:', row.public_key_preview + '...');
      console.log('Encrypted:', row.encrypted_preview + '...');
      console.log('Created:', row.created_at);
      console.log('Updated:', row.updated_at);
      console.log('---');
    });

    // Check VMs using this key
    console.log('\n🖥️  VMs using admin key:\n');
    const vmResult = await client.query(
      `SELECT id, display_name, system_ssh_key_id 
       FROM oracle.vm_instances 
       WHERE system_ssh_key_id IS NOT NULL 
       LIMIT 5`
    );

    vmResult.rows.forEach(vm => {
      console.log(`VM #${vm.id}: ${vm.display_name} → Key ID ${vm.system_ssh_key_id}`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

checkAdminKey();
