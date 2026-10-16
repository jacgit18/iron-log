import { describe, expect, it } from 'vitest';
import { createAccountClient } from './account.js';

const reply = (status: number, body?: unknown): typeof fetch => (async () => new Response(body === undefined ? null : JSON.stringify(body), { status })) as typeof fetch;
const down: typeof fetch = async () => { throw new TypeError('offline'); };

describe('account client', () => {
  it('reads a signed-in account', async () => {
    const c = createAccountClient({ fetch: reply(200, { ok: true, userId: 'u1', account: { kind: 'session', email: 'a@b.co', name: 'Ann' } }) });
    expect(await c.me()).toEqual({ status: 'signed-in', userId: 'u1', kind: 'session', email: 'a@b.co', name: 'Ann', isAdmin: false });
  });

  it('reads isAdmin only when the API says exactly true', async () => {
    const ask = (isAdmin: unknown) => createAccountClient({ fetch: reply(200, { ok: true, userId: 'u1', account: { kind: 'session', isAdmin } }) }).me();
    expect(await ask(true)).toMatchObject({ isAdmin: true });
    for (const v of [false, 'true', 1, undefined]) expect(await ask(v)).toMatchObject({ isAdmin: false });
  });

  it('treats a 401 as signed out', async () => {
    expect(await createAccountClient({ fetch: reply(401, { ok: false }) }).me()).toEqual({ status: 'signed-out' });
  });

  it('never reads a network or server failure, or a strange answer, as signed out', async () => {
    expect(await createAccountClient({ fetch: down }).me()).toEqual({ status: 'unreachable' });
    expect(await createAccountClient({ fetch: reply(503, {}) }).me()).toEqual({ status: 'unreachable' });
    expect(await createAccountClient({ fetch: reply(200, { hello: 1 }) }).me()).toEqual({ status: 'unreachable' });
  });

  it('sends the dev header when given one', async () => {
    let seen: Headers | undefined;
    const f: typeof fetch = async (_u, init) => { seen = new Headers(init?.headers); return new Response('{}', { status: 401 }); };
    await createAccountClient({ fetch: f, headers: () => ({ 'x-dev-user': 'dev' }) }).me();
    expect(seen?.get('x-dev-user')).toBe('dev');
  });

  it('asks for the Google address and returns it', async () => {
    let call: { url: string; body: string } | undefined;
    const f: typeof fetch = async (u, init) => { call = { url: String(u), body: String(init?.body) }; return new Response(JSON.stringify({ url: 'https://accounts.google.com/x', redirect: true }), { status: 200 }); };
    expect(await createAccountClient({ fetch: f }).startGoogleSignIn()).toEqual({ ok: true, url: 'https://accounts.google.com/x' });
    expect(call).toEqual({ url: '/api/auth/sign-in/social', body: JSON.stringify({ provider: 'google', callbackURL: '/' }) });
  });

  it('tells a refused sign-in from an unreachable one', async () => {
    expect(await createAccountClient({ fetch: reply(404, {}) }).startGoogleSignIn()).toEqual({ ok: false, reason: 'refused' });
    expect(await createAccountClient({ fetch: reply(200, {}) }).startGoogleSignIn()).toEqual({ ok: false, reason: 'refused' });
    expect(await createAccountClient({ fetch: reply(503, {}) }).startGoogleSignIn()).toEqual({ ok: false, reason: 'unreachable' });
    expect(await createAccountClient({ fetch: down }).startGoogleSignIn()).toEqual({ ok: false, reason: 'unreachable' });
  });

  it('signs out', async () => {
    expect(await createAccountClient({ fetch: reply(200, { success: true }) }).signOut()).toBe(true);
    expect(await createAccountClient({ fetch: down }).signOut()).toBe(false);
  });

  it('shares one request among checks that overlap, and asks again once the answer is in', async () => {
    let calls = 0;
    const counting: typeof fetch = (async () => { calls++; await Promise.resolve(); return new Response(JSON.stringify({ userId: 'u1', account: { kind: 'session' } }), { status: 200 }); }) as typeof fetch;
    const a = createAccountClient({ fetch: counting });
    const b = createAccountClient({ fetch: counting });
    const answers = await Promise.all([a.me(), b.me(), a.me(), b.me(), a.me()]);
    expect(calls).toBe(1);
    expect(new Set(answers.map(x => JSON.stringify(x))).size).toBe(1);
    await a.me();
    expect(calls).toBe(2); // not a cache: a check made after the last one finished is a fresh request
  });

  it('does not share between checks that send different headers', async () => {
    let calls = 0;
    const f: typeof fetch = (async () => { calls++; return new Response(null, { status: 401 }); }) as typeof fetch;
    await Promise.all([createAccountClient({ fetch: f, headers: () => ({ 'x-dev-user': 'a' }) }).me(), createAccountClient({ fetch: f, headers: () => ({ 'x-dev-user': 'b' }) }).me(), createAccountClient({ fetch: f, headers: () => ({ 'x-dev-user': 'a' }) }).me()]);
    expect(calls).toBe(2); // a and b are two questions; the second a shares the first
  });

  it('does not share between different fetch functions or addresses', async () => {
    let calls = 0;
    const mk = (): typeof fetch => (async () => { calls++; return new Response(null, { status: 401 }); }) as typeof fetch;
    await Promise.all([createAccountClient({ fetch: mk() }).me(), createAccountClient({ fetch: mk() }).me()]);
    const f = mk();
    await Promise.all([createAccountClient({ fetch: f, baseUrl: 'https://a' }).me(), createAccountClient({ fetch: f, baseUrl: 'https://b' }).me()]);
    expect(calls).toBe(4);
  });
});
