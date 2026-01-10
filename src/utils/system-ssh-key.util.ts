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
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: bits,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem',
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem',
    },
  });

  // Convert to OpenSSH format for public key
  const publicKeyOpenSSH = convertToOpenSSHFormat(publicKey);
  
  // Calculate fingerprint
  const fingerprint = calculateFingerprint(publicKeyOpenSSH);

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
  // Remove PEM headers and decode
  const pemBody = pemPublicKey
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, '');
  
  const der = Buffer.from(pemBody, 'base64');
  
  // Parse DER to get RSA public key components
  // This is a simplified version - you may want to use a library like 'node-forge'
  // For production, use: import { pki } from 'node-forge';
  
  const sshRsa = 'ssh-rsa';
  const base64Key = der.toString('base64');
  
  return `${sshRsa} ${base64Key} system@oraclecloud.vn`;
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
  const keyDir = path.join(process.cwd(), 'secrets', 'ssh-keys');
  const publicKeyPath = path.join(keyDir, `${keyName}_id_rsa.pub`);
  const privateKeyPath = path.join(keyDir, `${keyName}_id_rsa`);

  if (!fs.existsSync(publicKeyPath) || !fs.existsSync(privateKeyPath)) {
    return null;
  }

  const publicKey = fs.readFileSync(publicKeyPath, 'utf8').trim();
  const privateKey = fs.readFileSync(privateKeyPath, 'utf8').trim();
  const fingerprint = calculateFingerprint(publicKey);

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
