import { randomBytes } from 'node:crypto';
import type { DBAdapter } from '@better-auth/core/db/adapter';
import { describe, expect, it } from 'vitest';
import { encryptedAdapter } from './encryptedAdapter.ts';
import { createPiiCrypto } from './piiCrypto.ts';

// With PII_PLAINTEXT_DONE=true (rejectUnsealed) a sealed column that still holds plain text throws on read; without it, plain text still
// reads as before (backlog audit #4). An inner adapter that returns a fixed row stands in for the database.
const crypto = createPiiCrypto(randomBytes(32));
const innerReturning = (row: unknown) => ({ findOne: async () => row, findMany: async () => [row] }) as unknown as DBAdapter;
const read = (row: unknown, rejectUnsealed: boolean, model = 'user') =>
  encryptedAdapter(innerReturning(row), crypto, { matchPlaintext: !rejectUnsealed, rejectUnsealed }).findOne({ model, where: [] } as never);

describe('encryptedAdapter with rejectUnsealed', () => {
  const plainUser = { id: 'u1', email: 'old@example.com', name: 'Ada', image: null };

  it('throws on a plaintext email, without printing it', async () => {
    const result = read(plainUser, true);
    await expect(result).rejects.toThrow('user.email holds an unsealed value');
    await expect(result).rejects.not.toThrow(/old@example\.com/);
  });

  it('still reads plain text when the flag is off (the half-migrated state)', async () => {
    expect(await read(plainUser, false)).toMatchObject({ email: 'old@example.com', name: 'Ada' });
  });

  it('reads a fully sealed row, an empty value and a null image', async () => {
    const sealed = { id: 'u1', email: crypto.sealStable('ada@example.com'), name: crypto.seal('Ada'), image: null };
    expect(await read(sealed, true)).toMatchObject({ email: 'ada@example.com', name: 'Ada', image: null });
    expect(await read({ ...sealed, name: '' }, true)).toMatchObject({ name: '' });
  });

  it('checks the user joined onto a session too', async () => {
    await expect(read({ id: 's1', user: plainUser }, true, 'session')).rejects.toThrow('user.email holds an unsealed value');
  });

  it('allows a verification identifier that is not an address (an OAuth state) but not a plaintext address', async () => {
    expect(await read({ id: 'v1', identifier: 'oauth-state-abc', value: 'x' }, true, 'verification')).toMatchObject({ identifier: 'oauth-state-abc' });
    await expect(read({ id: 'v2', identifier: 'sign-in-otp-ada@example.com', value: 'x' }, true, 'verification')).rejects.toThrow('verification.identifier holds an unsealed value');
  });
});
