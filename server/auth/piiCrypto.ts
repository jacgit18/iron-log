import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';

/* ---------- Encrypting names and emails in Better Auth's tables (ADR 046) ----------
   AES-256-GCM with keys derived (HKDF) from one master key, PII_ENCRYPTION_KEY (32 random bytes, base64), kept in Secret Manager.
   Stored form: `enc1:` + base64url(iv | tag | ciphertext). A value without the prefix is plaintext from before the switch-on and is
   returned as is, so a half-migrated table still reads (scripts/encrypt-users.mjs finishes the job).

   Two kinds of value:
   - random: a fresh IV each time (name, image). Nothing looks these up.
   - deterministic: the IV is an HMAC of the plaintext (the SIV idea), so the same address always gives the same ciphertext. That is
     what lets Better Auth keep finding a user `where email = ?` and keep its unique index. The cost is that equal values show as
     equal, which for a unique column reveals nothing. */

const PREFIX = 'enc1:';
const IV_BYTES = 12;
const TAG_BYTES = 16;

export interface PiiCrypto {
  /** Fresh IV every call. Null and empty pass through. */
  seal(plain: string): string;
  /** Same input, same output. For columns that are looked up or unique. */
  sealStable(plain: string): string;
  /** Decrypts a sealed value; anything without the prefix is returned unchanged. Throws on a tampered value or the wrong key. */
  open(stored: string): string;
  /** Whether a stored value is already sealed. */
  isSealed(stored: string): boolean;
}

/** Reads PII_ENCRYPTION_KEY: base64 of exactly 32 bytes. Returns the reason it is unusable, or the key. */
export function parsePiiKey(raw: string | undefined): { key: Buffer } | { error: string } {
  const text = raw?.trim();
  if (!text) return { error: 'PII_ENCRYPTION_KEY is not set' };
  const key = Buffer.from(text, 'base64');
  if (key.length !== 32) return { error: 'PII_ENCRYPTION_KEY must be 32 random bytes, base64 encoded (openssl rand -base64 32)' };
  return { key };
}

export function createPiiCrypto(masterKey: Buffer): PiiCrypto {
  if (masterKey.length !== 32) throw new Error('createPiiCrypto: the master key must be 32 bytes');
  const derive = (info: string) => Buffer.from(hkdfSync('sha256', masterKey, Buffer.alloc(0), `ironlog-pii-${info}`, 32));
  const encKey = derive('enc');
  const ivKey = derive('iv');

  const encrypt = (plain: string, iv: Buffer): string => {
    const cipher = createCipheriv('aes-256-gcm', encKey, iv);
    const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
  };

  const isSealed = (stored: string) => stored.startsWith(PREFIX);

  return {
    seal: plain => (plain === '' ? plain : encrypt(plain, randomBytes(IV_BYTES))),
    sealStable: plain => (plain === '' ? plain : encrypt(plain, createHmac('sha256', ivKey).update(plain, 'utf8').digest().subarray(0, IV_BYTES))),
    open: stored => {
      if (!isSealed(stored)) return stored;
      const raw = Buffer.from(stored.slice(PREFIX.length), 'base64url');
      if (raw.length < IV_BYTES + TAG_BYTES) throw new Error('piiCrypto: sealed value is too short');
      const decipher = createDecipheriv('aes-256-gcm', encKey, raw.subarray(0, IV_BYTES));
      decipher.setAuthTag(raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      return Buffer.concat([decipher.update(raw.subarray(IV_BYTES + TAG_BYTES)), decipher.final()]).toString('utf8');
    },
    isSealed,
  };
}
