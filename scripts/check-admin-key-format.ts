import { config } from 'dotenv';
import { Client } from 'pg';
import * as fs from 'fs';

// Load environment variables
config();

/**
 * Check admin key format
 */
async function checkAdminKeyFormat() {
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
    console.log(`   Public key length: ${adminKey.public_key.length} chars`);
    console.log(`   Public key starts with: ${adminKey.public_key.substring(0, 100)}...`);
    
    // Check if it's proper SSH format
    const startsWithSshRsa = adminKey.public_key.startsWith('ssh-rsa ');
    const hasThreeParts = adminKey.public_key.split(' ').length >= 2;
    
    console.log('\n🔍 Format validation:');
    console.log(`   ✓ Starts with "ssh-rsa ": ${startsWithSshRsa ? '✅ YES' : '❌ NO'}`);
    console.log(`   ✓ Has at least 2 parts: ${hasThreeParts ? '✅ YES' : '❌ NO'}`);
    
    // Extract the base64 part
    const parts = adminKey.public_key.split(' ');
    if (parts.length >= 2) {
      const base64Part = parts[1];
      console.log(`   ✓ Base64 part length: ${base64Part.length} chars`);
      
      // Check if base64 is valid
      try {
        const decoded = Buffer.from(base64Part, 'base64');
        console.log(`   ✓ Base64 decodes to: ${decoded.length} bytes ✅`);
      } catch (err) {
        console.log(`   ✗ Base64 decode failed: ❌ ${err.message}`);
      }
    }
    
    // Save to temp file for ssh-keygen validation
    const tempFile = 'secrets/ssh-keys/temp-admin-db.pub';
    fs.writeFileSync(tempFile, adminKey.public_key, 'utf8');
    console.log(`\n💾 Saved to: ${tempFile}`);
    console.log('   Run this to validate: ssh-keygen -lf secrets/ssh-keys/temp-admin-db.pub');
    
    // Compare with file key
    const fileKeyPath = 'secrets/ssh-keys/admin_id_rsa.pub';
    if (fs.existsSync(fileKeyPath)) {
      const fileKey = fs.readFileSync(fileKeyPath, 'utf8').trim();
      console.log('\n📄 File admin_id_rsa.pub:');
      console.log(`   Public key length: ${fileKey.length} chars`);
      console.log(`   Public key starts with: ${fileKey.substring(0, 100)}...`);
      console.log(`   Same as DB key: ${fileKey === adminKey.public_key ? '✅ YES' : '❌ NO'}`);
    }

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await client.end();
    process.exit(1);
  }
}

// Run the script
checkAdminKeyFormat();
