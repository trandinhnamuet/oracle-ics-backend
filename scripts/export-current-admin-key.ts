import { config } from 'dotenv';
import { Client } from 'pg';
import * as crypto from 'crypto';
import * as fs from 'fs';

config();

/**
 * Decrypt private key (same logic as system-ssh-key.util.ts)
 */
function decryptPrivateKey(encryptedPrivateKey: string): string {
  const [ivHex, encryptedHex] = encryptedPrivateKey.split(':');
  const algorithm = 'aes-256-cbc';
  const encryptionKey = process.env.SSH_KEY_ENCRYPTION_SECRET || 'default-secret-key-change-this-in-production';
  
  // Use SHA-256 hash to ensure key is exactly 32 bytes (same as util)
  const key = crypto.createHash('sha256').update(encryptionKey).digest();
  
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function exportCurrentAdminKey() {
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
    console.log('✅ Connected\n');

    const result = await client.query(
      `SELECT * FROM oracle.system_ssh_keys WHERE key_name = 'default-admin-key' AND is_active = true LIMIT 1`
    );

    if (result.rows.length === 0) {
      console.error('❌ No active admin key found');
      process.exit(1);
    }

    const adminKey = result.rows[0];
    console.log('📋 Current Admin Key in Database:');
    console.log(`   Fingerprint: ${adminKey.fingerprint}`);
    console.log(`   Public key: ${adminKey.public_key.substring(0, 80)}...\n`);

    // Decrypt private key
    console.log('🔓 Decrypting private key...');
    let privateKey = decryptPrivateKey(adminKey.private_key_encrypted);
    
    // Convert PKCS#8 to PKCS#1 if needed (for ssh2 compatibility)
    if (privateKey.includes('BEGIN PRIVATE KEY')) {
      console.log('🔄 Converting PKCS#8 to PKCS#1...');
      const keyObject = crypto.createPrivateKey(privateKey);
      privateKey = keyObject.export({ type: 'pkcs1', format: 'pem' }).toString();
    }
    console.log('✅ Decrypted\n');

    // Save to file
    const outputFile = 'secrets/ssh-keys/admin-key-NEW.pem';
    fs.writeFileSync(outputFile, privateKey, { mode: 0o600 });
    console.log(`💾 Saved to: ${outputFile}`);
    console.log(`   File mode: 600 (read/write owner only)\n`);

    // Save public key too
    const pubOutputFile = 'secrets/ssh-keys/admin-key-NEW.pub';
    fs.writeFileSync(pubOutputFile, adminKey.public_key, 'utf8');
    console.log(`💾 Saved public key to: ${pubOutputFile}\n`);

    // Validate
    console.log('✅ Export successful!');
    console.log('\n📝 To test SSH connection:');
    console.log(`   ssh -i secrets/ssh-keys/admin-key-NEW.pem ubuntu@<VM_IP>\n`);

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await client.end();
    process.exit(1);
  }
}

exportCurrentAdminKey();
