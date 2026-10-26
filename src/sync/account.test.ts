import { describe, expect, it } from 'vitest';
import { createAccountClient } from './account.js';

const reply = (status: number, body?: unknown): typeof fetch => (async () => new Response(body === undefined ? null : JSON.stringify(body), { status })) as typeof fetch;
const down: typeof fetch = async () => { throw new TypeError('offline'); };

describe('account client', () => {
  it('reads a signed-in account', async () => {
    const c = createAccountClient({ fetch: reply(200, { ok: true, userId: 'u1', account: { kind: 'session', email: 'a@b.co', name: 'Ann' } }) });
    expect(await c.me()).toEqual({ status: 'signed-in', userId: 'u1', kind: 'session', email: 'a@b.co', name: 'Ann', isAdmin: false, isPaid: false });
  });

  it('reads isPaid only when the API says exactly true', async () => {
    const ask = (isPaid: unknown) => createAccountClient({ fetch: reply(200, { ok: true, userId: 'u1', account: { kind: 'session', isPaid } }) }).me();
    expect(await ask(true)).toMatchObject({ isPaid: true });
    for (const v of [false, 'true', 1, undefined]) expect(await ask(v)).toMatchObject({ isPaid: false });
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

  describe('a /api/me that never answers', () => {
    const guard = <T>(p: Promise<T>, ms = 1000) => Promise.race([p, new Promise<'hung'>(r => setTimeout(() => r('hung'), ms))]);
    // Like a real fetch: the promise or the body read fails when the request is aborted.
    const neverAnswers: typeof fetch = (_u, init) => new Promise((_ok, fail) => init?.signal?.addEventListener('abort', () => fail(new DOMException('aborted', 'AbortError'))));
    const stalledBody: typeof fetch = async (_u, init) => ({
      ok: true, status: 200, json: () => new Promise((_ok, fail) => init?.signal?.addEventListener('abort', () => fail(new DOMException('aborted', 'AbortError')))),
    }) as unknown as Response;

    it('gives up after the timeout and says unreachable, never signed out', async () => {
      expect(await guard(createAccountClient({ fetch: neverAnswers, timeoutMs: 50 }).me())).toEqual({ status: 'unreachable' });
    });
    it('gives up on a body that stalls after the headers', async () => {
      expect(await guard(createAccountClient({ fetch: stalledBody, timeoutMs: 50 }).me())).toEqual({ status: 'unreachable' });
    });
    it('still reads an answer that arrives inside the timeout', async () => {
      const slow: typeof fetch = async () => { await new Promise(r => setTimeout(r, 20)); return new Response(JSON.stringify({ ok: true, userId: 'u1', account: { kind: 'session' } }), { status: 200 }); };
      expect(await guard(createAccountClient({ fetch: slow, timeoutMs: 300 }).me())).toMatchObject({ status: 'signed-in', userId: 'u1' });
    });
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
});
