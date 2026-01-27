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
 */

async function exportAdminKey() {
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

    // Decrypt private key
    console.log('\n🔓 Decrypting admin private key...');
    let privateKey = decryptPrivateKey(adminKey.private_key_encrypted);

    // Check key format
    console.log(`   Original format: ${privateKey.includes('BEGIN RSA PRIVATE KEY') ? 'PKCS#1 (RSA)' : privateKey.includes('BEGIN PRIVATE KEY') ? 'PKCS#8' : 'Unknown'}`);

    // Convert PKCS#8 to PKCS#1 if needed (for ssh2 compatibility)
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
