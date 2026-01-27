const { Client } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

const encryptionSecret = process.env.SSH_KEY_ENCRYPTION_SECRET || 'your-secure-encryption-secret-key-min-32-chars-long';

async function checkKeyPair() {
  const client = new Client({
    host: 'aws-1-ap-southeast-1.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.sxlnlxnqhdsrmpjcdpzl',
    password: process.env.DB_PASSWORD || 'your-db-password',
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Query system_ssh_keys table
    const result = await client.query(`
      SELECT id, key_name, public_key, private_key_encrypted
      FROM oracle.system_ssh_keys
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (result.rows.length === 0) {
      console.log('❌ No SSH keys found in database');
      return;
    }

    console.log(`Found ${result.rows.length} SSH keys\n`);
    console.log('='.repeat(100));

    for (let i = 0; i < result.rows.length; i++) {
      const key = result.rows[i];
      console.log(`\n📋 Key ${i + 1}: ${key.key_name || 'N/A'} (ID: ${key.id})`);
      console.log('-'.repeat(100));

      try {
        // Parse encrypted private key
        const [ivHex, dataHex] = key.private_key_encrypted.split(':');
        if (!ivHex || !dataHex) {
          console.log('❌ Invalid encrypted key format (missing IV:data split)');
          continue;
        }

        const iv = Buffer.from(ivHex, 'hex');
        const encrypted = Buffer.from(dataHex, 'hex');

        // Decrypt
        const keyHash = crypto.createHash('sha256').update(encryptionSecret).digest();
        const decipher = crypto.createDecipheriv('aes-256-cbc', keyHash, iv);
        let decrypted = decipher.update(encrypted);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        const privateKeyPEM = decrypted.toString('utf8');
        console.log('✅ Decryption successful');

        // Extract public key from private key
        const privateKeyObj = crypto.createPrivateKey(privateKeyPEM);
        const publicKeyObj = crypto.createPublicKey(privateKeyObj);

        // Convert to SSH format
        const jwk = publicKeyObj.export({ format: 'jwk' });
        const n = Buffer.from(jwk.n, 'base64');
        const e = Buffer.from(jwk.e, 'base64');

        // Build SSH wire format
        const keyType = 'ssh-rsa';
        const keyTypeBuffer = Buffer.from(keyType);
        const parts = [
          Buffer.allocUnsafe(4),
          keyTypeBuffer,
          Buffer.allocUnsafe(4),
          e,
          Buffer.allocUnsafe(4),
          n
        ];
        parts[0].writeUInt32BE(keyTypeBuffer.length, 0);
        parts[2].writeUInt32BE(e.length, 0);
        parts[4].writeUInt32BE(n.length, 0);

        const extractedPublicKey = 'ssh-rsa ' + Buffer.concat(parts).toString('base64');

        // Compare with database public key
        const dbPublicKey = key.public_key.trim();
        const matches = dbPublicKey === extractedPublicKey;

        console.log('\n📊 Comparison:');
        console.log('From DB:      ', dbPublicKey.substring(0, 70) + '...');
        console.log('From Private: ', extractedPublicKey.substring(0, 70) + '...');

        if (matches) {
          console.log('\n✅✅✅ MATCH! ✅✅✅');
          console.log('Public key và encrypted private key là 1 cặp chính xác!');
        } else {
          console.log('\n❌ NO MATCH - NOT A MATCHING PAIR!');
          
          // Fingerprints
          const dbFp = crypto.createHash('md5')
            .update(Buffer.from(dbPublicKey.split(' ')[1], 'base64'))
            .digest('hex');
          const extractedFp = crypto.createHash('md5')
            .update(Buffer.from(extractedPublicKey.split(' ')[1], 'base64'))
            .digest('hex');
          
          console.log('\nFingerprints:');
          console.log('From DB:      ', dbFp);
          console.log('From Private: ', extractedFp);
        }

      } catch (error) {
        console.log(`❌ Error processing key: ${error.message}`);
      }

      console.log('='.repeat(100));
    }

  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    if (error.message.includes('password')) {
      console.log('\n💡 Tip: Set DB_PASSWORD environment variable with your database password');
    }
  } finally {
    await client.end();
  }
}

checkKeyPair();
