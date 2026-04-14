const crypto = require('crypto');
const fs = require('fs');
const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5432, user: 'live', password: 'ics', database: 'ics' });

async function main() {
  const keyRes = await pool.query("SELECT private_key_encrypted FROM oracle.system_ssh_keys WHERE id=6");
  const enc = keyRes.rows[0].private_key_encrypted;
  
  const encryptionKey = 'your-secure-encryption-secret-key-min-32-chars-long';
  let keyBuffer = crypto.createHash('sha256').update(encryptionKey).digest();
  
  const parts = enc.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
  let rawKey = decipher.update(parts[1], 'hex', 'utf8') + decipher.final('utf8');
  
  if (rawKey.includes('BEGIN PRIVATE KEY')) {
    const keyObject = crypto.createPrivateKey(rawKey);
    rawKey = keyObject.export({ type: 'pkcs1', format: 'pem' }).toString();
  }
  if (!rawKey.endsWith('\n')) rawKey += '\n';
  
  fs.writeFileSync('/tmp/admin_key.pem', rawKey, { mode: 0o600 });
  console.log('Key saved to /tmp/admin_key.pem');
  console.log('Key type:', rawKey.substring(0, 40));
  console.log('Key lines:', rawKey.split('\n').length);
  pool.end();
}
main().catch(e => { console.error(e); process.exit(1); });