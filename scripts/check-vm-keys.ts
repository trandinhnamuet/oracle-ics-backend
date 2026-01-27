                                                                                                                                                                        import { config } from 'dotenv';
import { Client } from 'pg';

// Load environment variables
config();

/**
 * Check which admin key is in VMs
 */
async function checkVmKeys() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'postgres',
  });

  try {
    console.log('🔌 Connecting to database...');
    await client.connect();
    console.log('✅ Database connected');

    // Get admin key from database
    const adminKeyResult = await client.query(
      `SELECT * FROM oracle.system_ssh_keys WHERE key_name = 'default-admin-key' AND is_active = true LIMIT 1`
    );

    if (adminKeyResult.rows.length === 0) {
      console.error('❌ No active admin SSH key found in database');
      process.exit(1);
    }

    const adminKey = adminKeyResult.rows[0];
    console.log('\n📋 Admin Key in Database:');
    console.log(`   Fingerprint: ${adminKey.fingerprint}`);
    console.log(`   Public key starts with: ${adminKey.public_key.substring(0, 50)}...`);

    // Get all VMs
    const vmsResult = await client.query(
      `SELECT id, instance_name, public_ip, ssh_public_key, operating_system FROM oracle.vm_instances ORDER BY created_at DESC LIMIT 10`
    );

    console.log(`\n🖥️  Found ${vmsResult.rows.length} VMs (showing last 10):`);
    console.log('='.repeat(80));

    for (const vm of vmsResult.rows) {
      console.log(`\n📦 VM: ${vm.instance_name}`);
      console.log(`   Public IP: ${vm.public_ip || 'N/A'}`);
      console.log(`   OS: ${vm.operating_system}`);
      console.log(`   User SSH key starts with: ${vm.ssh_public_key?.substring(0, 50)}...`);
      
      // Compare with admin key
      const hasAdminKey = vm.ssh_public_key?.includes(adminKey.public_key.substring(20, 100));
      console.log(`   ❓ Has admin key from DB: ${hasAdminKey ? '✅ YES' : '❌ NO'}`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n💡 Summary:');
    console.log('   If VMs show "❌ NO", it means the admin key in database was NOT added to those VMs');
    console.log('   This happens when:');
    console.log('     1. VMs were created BEFORE admin key was generated');
    console.log('     2. OR admin key was regenerated AFTER VMs were created');
    console.log('\n💡 Solution:');
    console.log('   For Request New SSH Key to work, we need to:');
    console.log('     1. Use user\'s current SSH key (saved in vm_instances.ssh_public_key) to SSH');
    console.log('     2. But we don\'t have user\'s private key!');
    console.log('     3. SO: Either ask user to provide their current private key,');
    console.log('        OR: Manually add admin key to existing VMs via OCI console');

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await client.end();
    process.exit(1);
  }
}

// Run the script
checkVmKeys();
