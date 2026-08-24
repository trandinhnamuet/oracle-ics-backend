import { config } from 'dotenv';
import { Client } from 'pg';
import * as crypto from 'crypto';

config();

// Fail closed: never fall back to a hard-coded key literal (a static analyzer flags a
// string literal used as AES key material, and a fallback key is a real weakness).
function getEncSecret(): string {
  const s = process.env.SSH_KEY_ENCRYPTION_SECRET;
  if (!s) throw new Error('SSH_KEY_ENCRYPTION_SECRET not configured in environment');
  return s;
}

function decryptPrivateKey(encryptedPrivateKey: string): string {
  const [ivHex, encryptedHex] = encryptedPrivateKey.split(':');
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(getEncSecret(), 'utf8').slice(0, 32);
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function encryptPrivateKey(privateKey: string): string {
  const algorithm = 'aes-256-cbc';
  const key = Buffer.from(getEncSecret(), 'utf8').slice(0, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

async function reEncryptAdminKey() {
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

    // Get current admin key
    const result = await client.query(
      `SELECT * FROM oracle.system_ssh_keys WHERE key_name = 'default-admin-key' AND is_active = true LIMIT 1`
    );

    if (result.rows.length === 0) {
      console.error('❌ No active admin key found');
      process.exit(1);
    }

    const adminKey = result.rows[0];
    console.log('📋 Current Admin Key:');
    console.log(`   Fingerprint: ${adminKey.fingerprint}`);
    console.log(`   Encrypted private key length: ${adminKey.private_key_encrypted.length}\n`);

    // Try to decrypt with current secret
    console.log('🔓 Attempting to decrypt with current SSH_KEY_ENCRYPTION_SECRET...');

    try {
      const privateKey = decryptPrivateKey(adminKey.private_key_encrypted);
      console.log('✅ Decryption successful! (Key is already using current secret)\n');
      console.log('💡 No re-encryption needed. Admin key is already encrypted with current secret.');
      await client.end();
      return;
    } catch (error: any) {
      console.log('❌ Decryption failed with current secret');
      console.log(`   Error: ${error.message}\n`);
    }

    // If decryption failed, admin key might be encrypted with old secret
    // Load private key from file instead
    console.log('🔄 Loading private key from file: secrets/ssh-keys/admin_id_rsa');
    const fs = require('fs');
    if (!fs.existsSync('secrets/ssh-keys/admin_id_rsa')) {
      console.error('❌ File not found: secrets/ssh-keys/admin_id_rsa');
      console.log('\n💡 Solution: Run regenerate-admin-key.ts script to generate new admin key');
      await client.end();
      process.exit(1);
    }

    const privateKeyFromFile = fs.readFileSync('secrets/ssh-keys/admin_id_rsa', 'utf8');
    console.log('✅ Loaded from file\n');

    // Re-encrypt with current secret
    console.log('🔐 Re-encrypting with current secret...');
    const newEncrypted = encryptPrivateKey(privateKeyFromFile);
    console.log('✅ Re-encrypted\n');

    // Update database
    console.log('💾 Updating database...');
    await client.query(
      `UPDATE oracle.system_ssh_keys 
       SET private_key_encrypted = $1, 
           updated_at = NOW() 
       WHERE key_name = 'default-admin-key' AND is_active = true`,
      [newEncrypted]
    );
    console.log('✅ Database updated\n');

    // Verify
    console.log('🔍 Verifying decryption...');
    const verifyDecrypted = decryptPrivateKey(newEncrypted);
    console.log('✅ Verification successful!\n');

    console.log('✅ Admin key re-encrypted successfully!');
    console.log('   Now restart backend to use the new encryption.');

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await client.end();
    process.exit(1);
  }
}

reEncryptAdminKey();
