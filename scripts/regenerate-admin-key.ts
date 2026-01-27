import { config } from 'dotenv';
import { Client } from 'pg';
import * as crypto from 'crypto';
import * as fs from 'fs';

// Load environment variables
config();

/**
 * Convert PEM public key to OpenSSH format
 */
function convertToOpenSSHFormat(pemPublicKey: string): string {
  const keyObject = crypto.createPublicKey(pemPublicKey);
  const jwk: any = keyObject.export({ format: 'jwk' });
  
  const n = Buffer.from(jwk.n.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const e = Buffer.from(jwk.e.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  
  const buffers: Buffer[] = [];
  
  const algorithm = Buffer.from('ssh-rsa');
  const algLength = Buffer.alloc(4);
  algLength.writeUInt32BE(algorithm.length, 0);
  buffers.push(algLength, algorithm);
  
  const ePadded = (e[0] & 0x80) ? Buffer.concat([Buffer.from([0]), e]) : e;
  const eLength = Buffer.alloc(4);
  eLength.writeUInt32BE(ePadded.length, 0);
  buffers.push(eLength, ePadded);
  
  const nPadded = (n[0] & 0x80) ? Buffer.concat([Buffer.from([0]), n]) : n;
  const nLength = Buffer.alloc(4);
  nLength.writeUInt32BE(nPadded.length, 0);
  buffers.push(nLength, nPadded);
  
  const wireFormat = Buffer.concat(buffers);
  const base64Key = wireFormat.toString('base64');
  
  return `ssh-rsa ${base64Key} system@oraclecloud.vn`;
}

/**
 * Calculate MD5 fingerprint
 */
function calculateFingerprint(opensshKey: string): string {
  const parts = opensshKey.split(' ');
  const base64Key = parts[1];
  const buffer = Buffer.from(base64Key, 'base64');
  const md5 = crypto.createHash('md5').update(buffer).digest('hex');
  return md5.match(/.{2}/g)!.join(':');
}

/**
 * Encrypt private key (same logic as system-ssh-key.util.ts)
 */
function encryptPrivateKey(privateKey: string): string {
  const algorithm = 'aes-256-cbc';
  const encryptionKey = process.env.SSH_KEY_ENCRYPTION_SECRET || 'default-secret-key-change-this-in-production';
  
  // Use SHA-256 hash to ensure key is exactly 32 bytes (same as util)
  const key = crypto.createHash('sha256').update(encryptionKey).digest();
  
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Regenerate admin key with correct OpenSSH format
 */
async function regenerateAdminKey() {
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
    console.log('✅ Database connected\n');

    // Step 1: Generate new RSA key pair
    console.log('1️⃣ Generating new RSA 4096-bit key pair...');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem',
      },
      privateKeyEncoding: {
        type: 'pkcs1', // ssh2 requires PKCS#1 format
        format: 'pem',
      },
    });
    console.log('   ✅ Generated (PKCS#1 format for ssh2 compatibility)\n');

    // Step 2: Convert to OpenSSH format
    console.log('2️⃣ Converting public key to OpenSSH format...');
    const opensshPublicKey = convertToOpenSSHFormat(publicKey);
    console.log(`   Result: ${opensshPublicKey.substring(0, 80)}...\n`);
    
    // Validate
    const tempFile = 'secrets/ssh-keys/temp-new-admin.pub';
    fs.writeFileSync(tempFile, opensshPublicKey, 'utf8');
    const { execSync } = require('child_process');
    try {
      const result = execSync(`ssh-keygen -lf "${tempFile}"`, { encoding: 'utf8' });
      console.log(`   ✅ Validation: ${result.trim()}\n`);
    } catch (error: any) {
      console.error(`   ❌ Validation failed: ${error.message}`);
      process.exit(1);
    }
    fs.unlinkSync(tempFile);

    // Step 3: Calculate fingerprint
    console.log('3️⃣ Calculating fingerprint...');
    const fingerprint = calculateFingerprint(opensshPublicKey);
    console.log(`   Fingerprint: ${fingerprint}\n`);

    // Step 4: Encrypt private key
    console.log('4️⃣ Encrypting private key...');
    const encryptedPrivateKey = encryptPrivateKey(privateKey);
    console.log('   ✅ Encrypted\n');

    // Step 5: Update database
    console.log('5️⃣ Updating database...');
    await client.query(
      `UPDATE oracle.system_ssh_keys 
       SET public_key = $1, 
           private_key_encrypted = $2, 
           fingerprint = $3, 
           updated_at = NOW() 
       WHERE key_name = 'default-admin-key' AND is_active = true`,
      [opensshPublicKey, encryptedPrivateKey, fingerprint]
    );
    console.log('   ✅ Database updated\n');

    // Step 6: Save to files (backup)
    console.log('6️⃣ Saving to files...');
    fs.writeFileSync('secrets/ssh-keys/admin_id_rsa', privateKey, { mode: 0o600 });
    fs.writeFileSync('secrets/ssh-keys/admin_id_rsa.pub', opensshPublicKey, 'utf8');
    console.log('   ✅ Saved to secrets/ssh-keys/\n');

    console.log('✅ SUCCESS! Admin key regenerated with correct OpenSSH format.');
    console.log('\n⚠️  IMPORTANT:');
    console.log('   - New admin key has been generated');
    console.log('   - Existing VMs DO NOT have this key yet');
    console.log('   - For new VMs: They will get correct admin key automatically');
    console.log('   - For existing VMs: Need to manually add admin key or ask user for their private key\n');

    await client.end();
  } catch (error) {
    console.error('❌ Error:', error);
    await client.end();
    process.exit(1);
  }
}

// Run the script
regenerateAdminKey();
