import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createPiiCrypto, parsePiiKey } from './piiCrypto.ts';

const crypto = createPiiCrypto(randomBytes(32));

describe('piiCrypto', () => {
  it('opens what it sealed, for both kinds', () => {
    expect(crypto.open(crypto.seal('Ada Lovelace'))).toBe('Ada Lovelace');
    expect(crypto.open(crypto.sealStable('ada@example.com'))).toBe('ada@example.com');
    expect(crypto.open(crypto.seal('Zoë 🏋️'))).toBe('Zoë 🏋️');
  });

  it('never stores the plain text', () => {
    expect(crypto.seal('ada@example.com')).not.toContain('ada');
    expect(crypto.sealStable('ada@example.com')).toMatch(/^enc1:/);
  });

  it('gives the same ciphertext for the same email (so it can be looked up) but a fresh one for a name', () => {
    expect(crypto.sealStable('ada@example.com')).toBe(crypto.sealStable('ada@example.com'));
    expect(crypto.sealStable('ada@example.com')).not.toBe(crypto.sealStable('bob@example.com'));
    expect(crypto.seal('Ada')).not.toBe(crypto.seal('Ada'));
  });

  it('returns plaintext from before the switch-on unchanged, and leaves empty strings alone', () => {
    expect(crypto.open('old@example.com')).toBe('old@example.com');
    expect(crypto.seal('')).toBe('');
    expect(crypto.isSealed(crypto.seal('x'))).toBe(true);
    expect(crypto.isSealed('x')).toBe(false);
  });

  it('refuses a tampered value and a different key', () => {
    const sealed = crypto.seal('Ada');
    // Flip every bit of the last byte of the decoded value. (Swapping the last two characters for 'AA' left the bytes unchanged about one run in 256,
    // when the real last byte was 0, so the test failed at random.)
    const raw = Buffer.from(sealed.slice('enc1:'.length), 'base64url');
    raw[raw.length - 1] ^= 0xff;
    const flipped = `enc1:${raw.toString('base64url')}`;
    expect(() => crypto.open(flipped)).toThrow();
    expect(() => createPiiCrypto(randomBytes(32)).open(sealed)).toThrow();
    expect(() => crypto.open('enc1:abc')).toThrow();
  });

  it('accepts only a base64 key of 32 bytes', () => {
    expect('key' in parsePiiKey(randomBytes(32).toString('base64'))).toBe(true);
    expect(parsePiiKey(undefined)).toHaveProperty('error');
    expect(parsePiiKey(randomBytes(16).toString('base64'))).toHaveProperty('error');
    expect(() => createPiiCrypto(Buffer.alloc(8))).toThrow();
  });
});
