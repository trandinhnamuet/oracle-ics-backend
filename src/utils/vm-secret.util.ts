import * as crypto from 'crypto';

/**
 * Encryption for Windows VM passwords held at rest.
 *
 * These passwords cannot be hashed: WinRM authentication needs the actual
 * value to perform a password reset on the guest. They are therefore stored
 * encrypted (AES-256-GCM) rather than in plain text, so a database dump alone
 * does not expose customer VM credentials.
 *
 * Values are tagged with a version prefix so plain-text rows written before
 * this change keep working — `decryptVmSecret` returns those untouched and the
 * next write re-stores them encrypted.
 */

const GCM_IV_LENGTH = 12;
// Pin the GCM authentication tag length. Without it the runtime will accept a
// truncated tag, which weakens the integrity guarantee the mode is chosen for.
const GCM_TAG_LENGTH = 16;
const PREFIX = 'encv1';

function deriveKeyBuffer(): Buffer {
  const secret = process.env.SSH_KEY_ENCRYPTION_SECRET;
  if (!secret) {
    throw new Error('SSH_KEY_ENCRYPTION_SECRET not configured in environment variables');
  }
  let keyBuffer: Buffer;
  try {
    keyBuffer = Buffer.from(secret, 'hex');
  } catch {
    keyBuffer = crypto.createHash('sha256').update(secret).digest();
  }
  if (keyBuffer.length !== 32) {
    keyBuffer = crypto.createHash('sha256').update(secret).digest();
  }
  return keyBuffer;
}

/** True when the stored value is in the encrypted envelope format. */
export function isEncryptedVmSecret(value: string | null | undefined): boolean {
  return typeof value === 'string' && value.startsWith(`${PREFIX}:`);
}

/**
 * Encrypt a VM password for storage. Returns `encv1:<iv>:<authTag>:<ciphertext>`.
 * Null/empty input passes through unchanged so callers can store "no password".
 */
export function encryptVmSecret(plain: string | null | undefined): string | null {
  if (plain === null || plain === undefined || plain === '') return (plain ?? null) as null;
  if (isEncryptedVmSecret(plain)) return plain; // already encrypted — don't double-wrap
  const iv = crypto.randomBytes(GCM_IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveKeyBuffer(), iv, {
    authTagLength: GCM_TAG_LENGTH,
  }) as crypto.CipherGCM;
  let encrypted = cipher.update(plain, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${PREFIX}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a stored VM password. Rows written before encryption was introduced
 * are plain text and are returned as-is.
 */
export function decryptVmSecret(stored: string | null | undefined): string | null {
  if (stored === null || stored === undefined || stored === '') return null;
  if (!isEncryptedVmSecret(stored)) return stored; // legacy plain-text row
  const parts = stored.split(':');
  if (parts.length !== 4) return null;
  const [, ivHex, tagHex, ciphertext] = parts;
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    deriveKeyBuffer(),
    Buffer.from(ivHex, 'hex'),
    { authTagLength: GCM_TAG_LENGTH },
  ) as crypto.DecipherGCM;
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}
