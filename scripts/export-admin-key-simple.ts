import { decryptPrivateKey } from '../src/utils/system-ssh-key.util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { config } from 'dotenv';
import { Client } from 'pg';

// Load environment variables
config();

/**
 * Simple script to export admin SSH key using direct SQL query
 * Usage: npx ts-node scripts/export-admin-key-simple.ts
 * 
 * The script:
 * 1. Connects to database
 * 2. Fetches encrypted admin SSH key
 * 3. Decrypts using SSH_KEY_ENCRYPTION_SECRET environment variable
 * 4. Exports to file
 */

async function exportAdminKey() {
  // Check encryption secret first
  const encryptionSecret = process.env.SSH_KEY_ENCRYPTION_SECRET;
  
  console.log('\n📋 Environment Variables:');
  console.log(`   SSH_KEY_ENCRYPTION_SECRET: ${encryptionSecret ? '✅ Set (' + encryptionSecret.length + ' chars)' : '❌ NOT SET'}`);
  console.log(`   DB_HOST: ${process.env.DB_HOST}`);
  console.log(`   DB_NAME: ${process.env.DB_NAME}`);
  
  if (!encryptionSecret) {
    console.log('\n⚠️  SSH_KEY_ENCRYPTION_SECRET not set! Using fallback...');
    console.log('   Fallback: default-secret-key-change-this-in-production');
  }
  
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

    // Query admin SSH key
    const result = await client.query(
      `SELECT * FROM oracle.system_ssh_keys WHERE key_name = 'default-admin-key' AND is_active = true LIMIT 1`
    );

    if (result.rows.length === 0) {
      console.error('❌ No active admin SSH key found in database');
      process.exit(1);
    }

    const adminKey = result.rows[0];
    console.log('✅ Admin key found in database');
    console.log(`   Key name: ${adminKey.key_name}`);
    console.log(`   Key type: ${adminKey.key_type}`);
    console.log(`   Algorithm: ${adminKey.algorithm}`);
    console.log(`   Key size: ${adminKey.key_size}`);
    console.log(`   Fingerprint: ${adminKey.fingerprint}`);
    console.log(`   Encrypted format: IV:encrypted_data`);
    console.log(`   Encrypted key preview: ${adminKey.private_key_encrypted.substring(0, 50)}...`);

    // Decrypt private key
    console.log('\n🔓 Decrypting admin private key...');
    console.log(`   Using encryption secret: ${encryptionSecret || 'default-secret-key-change-this-in-production'}`);
    
    let privateKey;
    try {
      privateKey = decryptPrivateKey(adminKey.private_key_encrypted);
      console.log('✅ Decryption successful!');
    } catch (decryptError: any) {
      console.error(`\n❌ Decryption failed: ${decryptError.message}`);
      console.error('\nTroubleshooting:');
      console.error('1. Check if SSH_KEY_ENCRYPTION_SECRET environment variable is correct');
      console.error('2. The secret must be exactly the same as when the key was encrypted');
      console.error('3. If unsure, try setting it to: "default-secret-key-change-this-in-production"');
      console.error('\nTo set the environment variable:');
      console.error('   Windows PowerShell: $env:SSH_KEY_ENCRYPTION_SECRET="your-secret"');
      console.error('   Linux/Mac: export SSH_KEY_ENCRYPTION_SECRET="your-secret"');
      console.error('   Or add to .env file in oracle-ics-backend/');
      await client.end();
      process.exit(1);
    }

    // Check key format
    console.log(`   Original format: ${privateKey.includes('BEGIN RSA PRIVATE KEY') ? 'PKCS#1 (RSA)' : privateKey.includes('BEGIN PRIVATE KEY') ? 'PKCS#8' : 'Unknown'}`);
    console.log(`   Key length: ${privateKey.length} bytes`);
    if (privateKey.includes('BEGIN PRIVATE KEY')) {
      console.log('🔄 Converting PKCS#8 to PKCS#1 format...');
      try {
        const keyObject = crypto.createPrivateKey(privateKey);
        privateKey = keyObject.export({
          type: 'pkcs1',
          format: 'pem',
        }).toString();
        console.log('✅ Key converted to PKCS#1 (RSA PRIVATE KEY)');
      } catch (convertError: any) {
        console.warn(`⚠️  Key conversion failed: ${convertError.message}`);
      }
    }

    // Ensure newline at end
    if (!privateKey.endsWith('\n')) {
      privateKey += '\n';
    }

    console.log(`   Final format: ${privateKey.includes('BEGIN RSA PRIVATE KEY') ? 'PKCS#1 (RSA)' : 'PKCS#8'}`);
    console.log(`   Key length: ${privateKey.length} bytes`);
    console.log(`   Key starts with: ${privateKey.substring(0, 50)}...`);

    // Save to file
    const outputDir = path.join(__dirname, '..', 'secrets', 'ssh-keys');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, 'admin-key-exported.pem');
    fs.writeFileSync(outputPath, privateKey, { mode: 0o600 });

    console.log(`\n✅ Admin private key exported successfully!`);
    console.log(`   File: ${outputPath}`);
    console.log(`   Permissions: 600 (read/write for owner only)`);

    // Save public key too
    const publicKeyPath = path.join(outputDir, 'admin-key-exported.pub');
    fs.writeFileSync(publicKeyPath, adminKey.public_key);
    console.log(`   Public key: ${publicKeyPath}`);

    console.log(`\n📝 To test SSH connection manually:`);
    console.log(`   Windows (PowerShell):`);
    console.log(`     ssh -i "${outputPath}" ubuntu@<VM_PUBLIC_IP>`);
    console.log(`   `);
    console.log(`   Linux/Mac:`);
    console.log(`     chmod 600 "${outputPath}"`);
    console.log(`     ssh -i "${outputPath}" ubuntu@<VM_PUBLIC_IP>`);
    console.log(`   `);
    console.log(`   Replace ubuntu with:`);
    console.log(`     - ubuntu  (for Ubuntu)`);
    console.log(`     - opc     (for Oracle Linux)`);
    console.log(`     - centos  (for CentOS)`);
    console.log(`     - rocky   (for Rocky Linux)`);
    console.log(`   `);
    console.log(`   If connection fails, check:`);
    console.log(`     1. VM has public IP and is running`);
    console.log(`     2. Port 22 is open in security list`);
    console.log(`     3. Admin key was added during VM provisioning`);
    console.log(`     4. This admin key matches the one in VM's authorized_keys`);

    await client.end();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error);
    await client.end();
    process.exit(1);
  }
}

// Run the script
exportAdminKey();
