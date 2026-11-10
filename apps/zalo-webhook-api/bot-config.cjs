const crypto = require('node:crypto');

function key() {
  const raw = process.env.ZALO_BOT_CONFIG_KEY || '';
  if (!/^[a-f0-9]{64}$/i.test(raw)) throw new Error('ZALO_BOT_CONFIG_KEY must be a 32-byte hex key');
  return Buffer.from(raw, 'hex');
}

function seal(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

function open(value) {
  const data = Buffer.from(value, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
}

const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const randomSecret = () => crypto.randomBytes(32).toString('base64url');
const randomSetupCode = () => crypto.randomBytes(12).toString('hex');

module.exports = { seal, open, digest, randomSecret, randomSetupCode };
