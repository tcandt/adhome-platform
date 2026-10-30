import crypto from 'node:crypto';

/**
 * Per-account password hashing for Console actors.
 *
 * Algorithm: scrypt (memory-hard KDF, Node.js built-in — no native addon required on Windows).
 * Stored format: `scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>`
 *
 * Parameters follow OWASP Password Storage Cheat Sheet guidance for scrypt
 * (N=2^15, r=8, p=1 → ~32 MiB memory per hash).
 *
 * There is intentionally NO default / fallback password anywhere in this module.
 */

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;
const MAX_MEM = 128 * 1024 * 1024;

export const MIN_PASSWORD_LENGTH = 14;
export const MAX_PASSWORD_LENGTH = 1024;

function scryptAsync(
  password: string,
  salt: Buffer,
  keyLen: number,
  opts: crypto.ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keyLen, opts, (err, derived) => {
      if (err) reject(err);
      else resolve(derived);
    });
  });
}

export function validatePasswordPolicy(password: unknown): { ok: true } | { ok: false; reason: string } {
  if (typeof password !== 'string') return { ok: false, reason: 'PASSWORD_NOT_STRING' };
  if (password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: 'PASSWORD_TOO_SHORT' };
  if (password.length > MAX_PASSWORD_LENGTH) return { ok: false, reason: 'PASSWORD_TOO_LONG' };
  if (/^\s|\s$/.test(password)) return { ok: false, reason: 'PASSWORD_LEADING_TRAILING_WHITESPACE' };
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(password)).length;
  if (classes < 3) return { ok: false, reason: 'PASSWORD_TOO_SIMPLE' };
  return { ok: true };
}

export async function hashPassword(password: string): Promise<string> {
  const policy = validatePasswordPolicy(password);
  if (!policy.ok) {
    throw new Error(`Password rejected by policy: ${policy.reason}`);
  }
  const salt = crypto.randomBytes(SALT_LEN);
  const derived = await scryptAsync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: MAX_MEM,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

/**
 * A syntactically valid hash of a random, discarded secret. Used to equalise
 * response timing when the account does not exist or has no password set, so
 * that attackers cannot enumerate accounts via latency.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword(`Dummy-${crypto.randomBytes(24).toString('base64')}!9a`);
  }
  return dummyHashPromise;
}

/**
 * Constant-time verification. Returns false for ANY malformed input:
 * non-string password, empty password, null/undefined/malformed stored hash.
 */
export async function verifyPassword(
  password: unknown,
  storedHash: string | null | undefined
): Promise<boolean> {
  const passwordIsUsable =
    typeof password === 'string' && password.length > 0 && password.length <= MAX_PASSWORD_LENGTH;

  const hashToCheck = typeof storedHash === 'string' && storedHash.startsWith('scrypt$')
    ? storedHash
    : await getDummyHash();
  const hashIsReal = hashToCheck === storedHash;

  const parts = hashToCheck.split('$');
  if (parts.length !== 6) {
    return false;
  }
  const [, nStr, rStr, pStr, saltB64, hashB64] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p) || N < 16384 || r < 1 || p < 1) {
    return false;
  }
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  if (salt.length < SALT_LEN || expected.length < 32) {
    return false;
  }

  // Always run the KDF (even for unusable input) to keep timing uniform.
  const candidate = passwordIsUsable ? (password as string) : `invalid-${crypto.randomUUID()}`;
  const derived = await scryptAsync(candidate, salt, expected.length, { N, r, p, maxmem: MAX_MEM });
  const matches = derived.length === expected.length && crypto.timingSafeEqual(derived, expected);

  return Boolean(matches && passwordIsUsable && hashIsReal);
}

export function generateStrongPassword(): string {
  // 24 random bytes → 32 base64url chars, plus guaranteed character classes.
  return `${crypto.randomBytes(24).toString('base64url')}-Aa9`;
}

