import { describe, expect, it } from 'vitest';
import { createAccountClient } from './account.js';

const reply = (status: number, body?: unknown): typeof fetch => (async () => new Response(body === undefined ? null : JSON.stringify(body), { status })) as typeof fetch;
const down: typeof fetch = async () => { throw new TypeError('offline'); };

describe('emailCodeOpen', () => {
  it('is true only when the server says exactly true', async () => {
    expect(await createAccountClient({ fetch: reply(200, { ok: true, emailCode: true }) }).emailCodeOpen()).toBe(true);
    for (const v of [false, 'true', 1, undefined]) expect(await createAccountClient({ fetch: reply(200, { ok: true, emailCode: v }) }).emailCodeOpen()).toBe(false);
  });
  it('is false when the server cannot say: an error, an old server, a broken answer, no network', async () => {
    expect(await createAccountClient({ fetch: reply(404) }).emailCodeOpen()).toBe(false);
    expect(await createAccountClient({ fetch: reply(503, {}) }).emailCodeOpen()).toBe(false);
    expect(await createAccountClient({ fetch: reply(200) }).emailCodeOpen()).toBe(false);
    expect(await createAccountClient({ fetch: down }).emailCodeOpen()).toBe(false);
  });
});

describe('sendEmailCode and signInWithEmailCode', () => {
  it('post the sign-in shape Better Auth expects', async () => {
    const seen: { url: string; body: unknown }[] = [];
    const spy = (async (url: string, init: RequestInit) => { seen.push({ url, body: JSON.parse(String(init.body)) }); return new Response('{}', { status: 200 }); }) as unknown as typeof fetch;
    const c = createAccountClient({ fetch: spy });
    expect(await c.sendEmailCode('a@b.co')).toBe('ok');
    expect(await c.signInWithEmailCode('a@b.co', '123456')).toBe('ok');
    expect(seen).toEqual([
      { url: '/api/auth/email-otp/send-verification-otp', body: { email: 'a@b.co', type: 'sign-in' } },
      { url: '/api/auth/sign-in/email-otp', body: { email: 'a@b.co', otp: '123456' } },
    ]);
  });
  it('tell a refused answer, the rate limit, a server fault and no network apart', async () => {
    for (const call of [(c: ReturnType<typeof createAccountClient>) => c.sendEmailCode('a@b.co'), (c: ReturnType<typeof createAccountClient>) => c.signInWithEmailCode('a@b.co', '123456')]) {
      expect(await call(createAccountClient({ fetch: reply(400, {}) }))).toBe('refused');
      expect(await call(createAccountClient({ fetch: reply(403, {}) }))).toBe('refused');
      expect(await call(createAccountClient({ fetch: reply(429, {}) }))).toBe('slow-down');
      expect(await call(createAccountClient({ fetch: reply(500, {}) }))).toBe('unreachable');
      expect(await call(createAccountClient({ fetch: down }))).toBe('unreachable');
    }
  });
});
