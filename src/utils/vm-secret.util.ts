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
  // Only treat the secret as a raw AES-256 key when it is EXACTLY 64 hex chars
  // (→ 32 bytes). Buffer.from(x, 'hex') silently decodes valid leading pairs and
  // stops at the first invalid nibble, so a secret whose first 64 chars are hex
  // would be truncated to 32 bytes and accepted, discarding the rest of its
  // entropy. Anything else (including the current 42-char non-hex secret) is
  // hashed with sha256, which is unchanged from the previous behavior.
  if (/^[0-9a-fA-F]{64}$/.test(secret)) {
    return Buffer.from(secret, 'hex');
  }
  return crypto.createHash('sha256').update(secret).digest();
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
  try {
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
  } catch {
    // GCM auth failure (rotated key / corrupted row). Do NOT leak the secret or
    // key material in the error. Every caller treats null as "no usable secret"
    // (via `?? undefined` or an explicit null check), so fail closed with null
    // rather than throwing an opaque 500.
    return null;
  }
}
