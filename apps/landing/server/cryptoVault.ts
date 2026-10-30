import crypto from 'node:crypto';

const VAULT_SALT = 'adhome-v2-integration-credentials-vault-salt-2026';

let cachedVaultKey: Buffer | null = null;

function getVaultKey(): Buffer {
  if (cachedVaultKey) return cachedVaultKey;

  const rawSecret =
    process.env.ADHOME_CREDENTIALS_ENCRYPTION_KEY ||
    process.env.ADHOME_CONSOLE_JWT_SECRET ||
    'adhome-dev-insecure-master-vault-encryption-key-32bytes!';

  // Derive exact 32-byte key via HKDF (sha256)
  cachedVaultKey = crypto.hkdfSync(
    'sha256',
    Buffer.from(rawSecret, 'utf-8'),
    Buffer.from(VAULT_SALT, 'utf-8'),
    Buffer.from('adhome-credentials-vault', 'utf-8'),
    32
  ) as Buffer;

  return cachedVaultKey;
}

export interface EncryptedSecretPayload {
  alg: 'aes-256-gcm';
  iv: string; // hex
  tag: string; // hex
  ciphertext: string; // hex
  updatedAt: string;
}

/**
 * Encrypts an external provider API key / secret using AES-256-GCM.
 * Reversible only with the server-side vault key.
 */
export function encryptSecret(plaintext: string): EncryptedSecretPayload {
  const key = getVaultKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let ciphertext = cipher.update(plaintext, 'utf-8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return {
    alg: 'aes-256-gcm',
    iv: iv.toString('hex'),
    tag,
    ciphertext,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Decrypts an EncryptedSecretPayload back to plaintext string.
 */
export function decryptSecret(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;

  if (p.alg !== 'aes-256-gcm' || typeof p.iv !== 'string' || typeof p.tag !== 'string' || typeof p.ciphertext !== 'string') {
    return null;
  }

  try {
    const key = getVaultKey();
    const iv = Buffer.from(p.iv, 'hex');
    const tag = Buffer.from(p.tag, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(p.ciphertext, 'hex', 'utf-8');
    decrypted += decipher.final('utf-8');
    return decrypted;
  } catch {
    return null;
  }
}

/**
 * Generates safe display hint for UI (e.g. ••••••••8888) so raw secret never leaves server.
 */
export function maskSecretHint(secret: string): string {
  const trimmed = String(secret || '').trim();
  if (trimmed.length === 0) return '';
  if (trimmed.length <= 4) return '••••';
  return `••••••••${trimmed.slice(-4)}`;
}
