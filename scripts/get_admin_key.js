const crypto = require('crypto');
const fs = require('fs');
const { execSync } = require('child_process');

const encKey = 'your-secure-encryption-secret-key-min-32-chars-long';
const dbPass = 'ics';
const row = execSync(
  `PGPASSWORD=${dbPass} psql -U live -h localhost -d ics -t -A -c "SELECT private_key_encrypted FROM oracle.system_ssh_keys WHERE id=6"`
).toString().trim();

const [ivHex, encHex] = row.split(':');
const key = crypto.createHash('sha256').update(encKey).digest();
const iv = Buffer.from(ivHex, 'hex');
const d = crypto.createDecipheriv('aes-256-cbc', key, iv);
const dec = d.update(encHex, 'hex', 'utf8') + d.final('utf8');

let finalKey = dec;
if (dec.includes('BEGIN PRIVATE KEY')) {
  console.log('Converting PKCS8 -> PKCS1...');
  const keyObject = crypto.createPrivateKey(dec);
  finalKey = keyObject.export({ type: 'pkcs1', format: 'pem' }).toString();
}
if (!finalKey.endsWith('\n')) finalKey += '\n';

console.log('KEY_TYPE:' + (finalKey.includes('BEGIN RSA') ? 'PKCS1_RSA' : 'OTHER'));
console.log('KEY_LEN:' + finalKey.length);
fs.writeFileSync('/tmp/admin_key.pem', finalKey, { mode: 0o600 });
console.log('SAVED:/tmp/admin_key.pem');
