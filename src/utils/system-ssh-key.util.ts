import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * System SSH Key Manager
 * Handles generation, storage, and retrieval of system-level SSH keys
 * used for admin access and web terminal functionality
 */

const IV_LENGTH = 16;

/**
 * Get encryption key from environment variable
 * This is a function so it reads the value at runtime, not at module load time
 */
function getEncryptionKey(): string {
  const key = process.env.SSH_KEY_ENCRYPTION_SECRET;
  if (!key) {
    throw new Error('SSH_KEY_ENCRYPTION_SECRET not configured in environment variables');
  }
  return key;
}

export interface SSHKeyPair {
  publicKey: string;
  privateKey: string;
  fingerprint: string;
}

/**
 * Generate RSA SSH key pair
 */
export function generateSSHKeyPair(bits: number = 4096): SSHKeyPair {
  console.log('\n🔑 GENERATING SSH KEY PAIR...');
  console.log('=' .repeat(80));
  
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: bits,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs1',  // Use PKCS#1 (RSA PRIVATE KEY) instead of PKCS#8
      format: 'pem',
    },
  });

  console.log('✅ Key pair generated');
  console.log(`   Raw public key (PEM): ${publicKey.substring(0, 60)}...`);
  console.log(`   Raw private key: ${privateKey.substring(0, 50)}...`);

  // Convert to OpenSSH format for public key
  console.log('\n🔄 Converting public key to OpenSSH format...');
  const publicKeyOpenSSH = convertToOpenSSHFormat(publicKey);
  console.log(`   OpenSSH public key: ${publicKeyOpenSSH.substring(0, 80)}...`);
  
  // Calculate fingerprint
  const fingerprint = calculateFingerprint(publicKeyOpenSSH);
  console.log(`   Fingerprint: ${fingerprint}`);
  console.log('=' .repeat(80) + '\n');

  return {
    publicKey: publicKeyOpenSSH,
    privateKey: privateKey,
    fingerprint: fingerprint,
  };
}

/**
 * Convert PEM public key to OpenSSH format
 */
function convertToOpenSSHFormat(pemPublicKey: string): string {
  console.log('\n  ➡️ Converting PEM to OpenSSH...');
  console.log(`     Input PEM: ${pemPublicKey.substring(0, 60)}...`);
  
  // Parse PEM key using Node.js crypto
  const keyObject = crypto.createPublicKey(pemPublicKey);
  
  // Export as JWK to get modulus (n) and exponent (e)
  const jwk: any = keyObject.export({ format: 'jwk' });
  
  // Convert base64url to base64
  const n = Buffer.from(jwk.n.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  const e = Buffer.from(jwk.e.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  
  // Build SSH wire format:
  // SSH format: string "ssh-rsa" + mpint e + mpint n
  // Each component: 4-byte length (big-endian) + data
  const buffers: Buffer[] = [];
  
  // 1. Algorithm name "ssh-rsa"
  const algorithm = Buffer.from('ssh-rsa');
  const algLength = Buffer.alloc(4);
  algLength.writeUInt32BE(algorithm.length, 0);
  buffers.push(algLength, algorithm);
  
  // 2. Exponent (e) - add 0x00 padding if high bit is set (two's complement)
  const ePadded = (e[0] & 0x80) ? Buffer.concat([Buffer.from([0]), e]) : e;
  const eLength = Buffer.alloc(4);
  eLength.writeUInt32BE(ePadded.length, 0);
  buffers.push(eLength, ePadded);
  
  // 3. Modulus (n) - add 0x00 padding if high bit is set
  const nPadded = (n[0] & 0x80) ? Buffer.concat([Buffer.from([0]), n]) : n;
  const nLength = Buffer.alloc(4);
  nLength.writeUInt32BE(nPadded.length, 0);
  buffers.push(nLength, nPadded);
  
  // Concatenate all parts and base64 encode
  const wireFormat = Buffer.concat(buffers);
  const base64Key = wireFormat.toString('base64');
  
  const result = `ssh-rsa ${base64Key} system@oraclecloud.vn`;
  console.log(`     Output OpenSSH: ${result.substring(0, 80)}...`);
  
  return result;
}

/**
 * Calculate SSH key fingerprint (MD5)
 */
function calculateFingerprint(publicKey: string): string {
  const parts = publicKey.split(' ');
  if (parts.length < 2) {
    throw new Error('Invalid SSH public key format');
  }
  
  const keyData = Buffer.from(parts[1], 'base64');
  const hash = crypto.createHash('md5').update(keyData).digest('hex');
  
  // Format as SSH fingerprint: XX:XX:XX:...
  return hash.match(/.{2}/g)?.join(':') || '';
}

/**
 * Encrypt private key for storage
 */
export function encryptPrivateKey(privateKey: string): string {
  const encryptionKey = getEncryptionKey();
  
  // Convert hex string to Buffer (assuming the key is provided as hex)
  let keyBuffer: Buffer;
  try {
    keyBuffer = Buffer.from(encryptionKey, 'hex');
  } catch (error) {
    // If not hex, use the raw string as UTF-8 and hash it to 32 bytes
    keyBuffer = crypto.createHash('sha256').update(encryptionKey).digest();
  }

  // Ensure key is exactly 32 bytes for aes-256-cbc
  if (keyBuffer.length !== 32) {
    keyBuffer = crypto.createHash('sha256').update(encryptionKey).digest();
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    keyBuffer,
    iv
  );
  
  let encrypted = cipher.update(privateKey, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt private key from storage
 */
export function decryptPrivateKey(encryptedKey: string): string {
  const encryptionKey = getEncryptionKey();
  
  // Convert hex string to Buffer (assuming the key is provided as hex)
  let keyBuffer: Buffer;
  try {
    keyBuffer = Buffer.from(encryptionKey, 'hex');
  } catch (error) {
    // If not hex, use the raw string as UTF-8 and hash it to 32 bytes
    keyBuffer = crypto.createHash('sha256').update(encryptionKey).digest();
  }

  // Ensure key is exactly 32 bytes for aes-256-cbc
  if (keyBuffer.length !== 32) {
    keyBuffer = crypto.createHash('sha256').update(encryptionKey).digest();
  }

  const parts = encryptedKey.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid encrypted key format');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = parts[1];
  
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    keyBuffer,
    iv
  );
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Save admin key pair to file system (backup)
 * Files are saved with strict permissions (600)
 */
export function saveKeyPairToFile(keyPair: SSHKeyPair, keyName: string = 'admin'): void {
  const keyDir = path.join(process.cwd(), 'secrets', 'ssh-keys');
  
  // Create directory if not exists
  if (!fs.existsSync(keyDir)) {
    fs.mkdirSync(keyDir, { recursive: true, mode: 0o700 });
  }

  const publicKeyPath = path.join(keyDir, `${keyName}_id_rsa.pub`);
  const privateKeyPath = path.join(keyDir, `${keyName}_id_rsa`);

  // Write keys with strict permissions
  fs.writeFileSync(publicKeyPath, keyPair.publicKey, { mode: 0o644 });
  fs.writeFileSync(privateKeyPath, keyPair.privateKey, { mode: 0o600 });

  console.log(`✅ Admin SSH keys saved to ${keyDir}`);
  console.log(`   Public key:  ${publicKeyPath}`);
  console.log(`   Private key: ${privateKeyPath}`);
}

/**
 * Load admin key pair from file system
 */
export function loadKeyPairFromFile(keyName: string = 'admin'): SSHKeyPair | null {
  console.log('\n📂 LOADING KEY FROM FILE...');
  console.log('=' .repeat(80));
  
  const keyDir = path.join(process.cwd(), 'secrets', 'ssh-keys');
  const publicKeyPath = path.join(keyDir, `${keyName}_id_rsa.pub`);
  const privateKeyPath = path.join(keyDir, `${keyName}_id_rsa`);

  console.log(`   Public key path: ${publicKeyPath}`);
  console.log(`   Private key path: ${privateKeyPath}`);

  if (!fs.existsSync(publicKeyPath) || !fs.existsSync(privateKeyPath)) {
    console.log('❌ Key files not found');
    console.log('=' .repeat(80) + '\n');
    return null;
  }

  const publicKeyFromFile = fs.readFileSync(publicKeyPath, 'utf8').trim();
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8').trim();

  console.log(`\n   Public key from file: ${publicKeyFromFile.substring(0, 80)}...`);
  console.log(`   Private key from file: ${privateKey.substring(0, 50)}...`);

  // Check if public key is in OpenSSH format
  let publicKey: string;
  const isValidOpenSSH = publicKeyFromFile.startsWith('ssh-rsa AAAAB3NzaC1yc2');
  
  if (publicKeyFromFile.startsWith('ssh-rsa ') && isValidOpenSSH) {
    // Already in OpenSSH format (correct base64 encoding)
    console.log('\n  ✅ Public key already in correct OpenSSH format');
    publicKey = publicKeyFromFile;
  } else {
    // PEM format - need to convert to OpenSSH
    console.log('\n  ⚠️ Public key in PEM format, converting to OpenSSH...');
    try {
      publicKey = convertToOpenSSHFormat(publicKeyFromFile);
      // Update file with correct format
      fs.writeFileSync(publicKeyPath, publicKey, { mode: 0o644 });
      console.log(`  ✅ Converted and updated file: ${publicKeyPath}`);
    } catch (error) {
      console.error(`  ❌ Failed to convert public key: ${error.message}`);
      console.log('=' .repeat(80) + '\n');
      return null;
    }
  }

  const fingerprint = calculateFingerprint(publicKey);
  console.log(`\n   Final public key: ${publicKey.substring(0, 80)}...`);
  console.log(`   Fingerprint: ${fingerprint}`);
  console.log('=' .repeat(80) + '\n');

  return { publicKey, privateKey, fingerprint };
}

/**
 * Format user data script to inject both user and admin SSH keys
 */
export function formatCloudInitWithKeys(
  userPublicKey: string,
  adminPublicKey: string,
  userPassword?: string
): string {
  let cloudInit = `#cloud-config

# Add SSH keys for both user and admin access
ssh_authorized_keys:
  - ${userPublicKey}
  - ${adminPublicKey}

# Allow password authentication if password is set
ssh_pwauth: ${userPassword ? 'true' : 'false'}
`;

  if (userPassword) {
    cloudInit += `
# Set user password
chpasswd:
  list: |
    opc:${userPassword}
    ubuntu:${userPassword}
  expire: false
`;
  }

  return cloudInit;
}
