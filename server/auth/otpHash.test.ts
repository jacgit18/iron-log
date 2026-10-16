import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { otpHasher } from './otpHash.ts';

const SECRET = 'a-test-secret-that-is-at-least-32-characters-long';

describe('otpHasher', () => {
  it('gives the same hash for the same code and secret', async () => {
    const hash = otpHasher(SECRET);
    expect(await hash('123456')).toBe(await hash('123456'));
    expect(await hash('123456')).not.toBe(await hash('123457'));
  });

  it('depends on the secret', async () => {
    expect(await otpHasher(SECRET)('123456')).not.toBe(await otpHasher(`${SECRET}-other`)('123456'));
  });

  it('is not the plain SHA-256 of the code, so the table alone cannot be searched', async () => {
    const plain = createHash('sha256').update('123456').digest('base64url');
    expect(await otpHasher(SECRET)('123456')).not.toBe(plain);
  });
});
