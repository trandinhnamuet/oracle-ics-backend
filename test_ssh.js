const { Client } = require('ssh2');
const crypto = require('crypto');
const { Pool } = require('pg');
const pool = new Pool({ host: 'localhost', port: 5432, user: 'live', password: 'ics', database: 'ics' });

async function main() {
  const keyRes = await pool.query("SELECT private_key_encrypted FROM oracle.system_ssh_keys WHERE id=6");
  const enc = keyRes.rows[0].private_key_encrypted;
  
  const encryptionKey = 'your-secure-encryption-secret-key-min-32-chars-long';
  let keyBuffer;
  try { keyBuffer = Buffer.from(encryptionKey, 'hex'); } catch(e) {
    keyBuffer = crypto.createHash('sha256').update(encryptionKey).digest();
  }
  if (keyBuffer.length !== 32) keyBuffer = crypto.createHash('sha256').update(encryptionKey).digest();
  
  const parts = enc.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
  let rawKey = decipher.update(parts[1], 'hex', 'utf8') + decipher.final('utf8');
  
  if (rawKey.includes('BEGIN PRIVATE KEY')) {
    try {
      const keyObject = crypto.createPrivateKey(rawKey);
      rawKey = keyObject.export({ type: 'pkcs1', format: 'pem' }).toString();
    } catch(e) { console.log('Key convert err:', e.message); }
  }
  if (!rawKey.endsWith('\n')) rawKey += '\n';
  
  console.log('Key type:', rawKey.substring(0, 40));
  
  const conn = new Client();
  conn.on('ready', () => { console.log('SSH CONNECTED!'); conn.end(); pool.end(); });
  conn.on('error', (err) => { console.log('SSH ERROR:', err.message); pool.end(); });
  
  console.log('Connecting to 161.33.197.92...');
  conn.connect({
    host: '161.33.197.92',
    port: 22,
    username: 'opc',
    privateKey: Buffer.from(rawKey, 'utf8'),
    password: 'O)TMOcy88p)J',
    readyTimeout: 30000,
    debug: (msg) => {
      if (msg.includes('uth') || msg.includes('publickey') || msg.includes('password') || msg.includes('handshake') || msg.includes('Trying')) {
        console.log('DBG:', msg.substring(0,200));
      }
    },
    algorithms: {
      serverHostKey: ['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ssh-ed25519'],
    },
  });
  
  setTimeout(() => { console.log('TIMEOUT'); pool.end(); process.exit(1); }, 40000);
}
main().catch(e => { console.error(e); process.exit(1); });