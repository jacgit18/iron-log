import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAccountClient, resetMeCache } from './account.js';

const signedIn = { ok: true, userId: 'u1', account: { kind: 'session', email: 'a@b.co', name: 'Ann' } };

describe('one /api/me for the whole page load', () => {
  let calls: string[];
  let answer: () => Response;
  beforeEach(() => {
    resetMeCache();
    calls = [];
    answer = () => new Response(JSON.stringify(signedIn), { status: 200 });
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { calls.push(url); return answer(); }));
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  const count = () => calls.filter(u => u.endsWith('/api/me')).length;

  it('joins a request in flight, whichever client asks', async () => {
    const [a, b, c] = await Promise.all([createAccountClient().me(), createAccountClient().me(), createAccountClient().me()]);
    expect(count()).toBe(1);
    expect(a).toEqual(b);
    expect(b).toEqual(c);
    expect(a).toMatchObject({ status: 'signed-in', userId: 'u1' });
  });

  it('reuses a signed-in answer for a few seconds, then asks again', async () => {
    vi.useFakeTimers();
    const c = createAccountClient();
    await c.me();
    await c.me();
    expect(count()).toBe(1);
    vi.advanceTimersByTime(3500);
    await c.me();
    expect(count()).toBe(2);
  });

  it('asks the server again when a re-check says fresh, even inside the reuse window', async () => {
    const c = createAccountClient();
    await c.me();
    await c.me({ fresh: true });
    await c.me({ fresh: true });
    expect(count()).toBe(3);
    await c.me();
    expect(count()).toBe(3); // the answer from the last fresh ask is reused again
  });

  it('never keeps an unreachable answer, so a retry asks again', async () => {
    answer = () => new Response(null, { status: 503 });
    const c = createAccountClient();
    expect(await c.me()).toEqual({ status: 'unreachable' });
    answer = () => new Response(JSON.stringify(signedIn), { status: 200 });
    expect(await c.me()).toMatchObject({ status: 'signed-in' });
    expect(count()).toBe(2);
  });

  it('forgets the answer on sign-out and sign-in', async () => {
    const c = createAccountClient();
    await c.me();
    await c.signOut();
    await c.me();
    expect(count()).toBe(2);
    await c.signInWithEmailCode('a@b.co', '123456');
    await c.me();
    expect(count()).toBe(3);
  });

  it('does not share between different dev-user headers', async () => {
    await createAccountClient({ headers: () => ({ 'x-dev-user': 'a' }) }).me();
    await createAccountClient({ headers: () => ({ 'x-dev-user': 'b' }) }).me();
    expect(count()).toBe(2);
  });

  it('a client given its own fetch never shares', async () => {
    const own = vi.fn(async () => new Response(JSON.stringify(signedIn), { status: 200 }));
    await createAccountClient({ fetch: own as unknown as typeof fetch }).me();
    await createAccountClient({ fetch: own as unknown as typeof fetch }).me();
    expect(own).toHaveBeenCalledTimes(2);
    expect(count()).toBe(0);
  });
});
