import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { byIp, ipKey, MAX_KEYS, rateLimit } from './rateLimit.ts';

const servers: Server[] = [];
async function start(limit: Parameters<typeof rateLimit>[0], now?: () => number, trustProxy?: number): Promise<string> {
  const app = express();
  if (trustProxy !== undefined) app.set('trust proxy', trustProxy);
  app.use(rateLimit(limit, now));
  app.get('/', (_req, res) => void res.json({ ok: true }));
  const s = app.listen(0);
  servers.push(s);
  await new Promise(done => s.once('listening', done));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}
afterAll(() => Promise.all(servers.map(s => new Promise<void>(done => s.close(() => done())))));

describe('rateLimit', () => {
  it('sweeps a large map at most once a second (audit S-6)', () => {
    let t = 1_000_000;
    let n = 0;
    const handler = rateLimit({ max: 5, windowMs: 1_000_000 }, () => t, () => `k${n++}`);
    const call = () => handler({ baseUrl: '', path: '/' } as never, { setHeader() {}, status() { return this; }, json() {} } as never, () => {});
    for (let i = 0; i < 10_001; i++) call();
    const walk = vi.spyOn(Map.prototype, Symbol.iterator);
    for (let i = 0; i < 20; i++) call(); // same millisecond: at most one sweep
    t += 1500;
    for (let i = 0; i < 20; i++) call(); // a second later: at most one more
    const walks = walk.mock.calls.length;
    walk.mockRestore();
    expect(walks).toBeLessThanOrEqual(2);
  });

  it('logs once when a caller first goes over, without the address', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const base = await start({ max: 1, windowMs: 60_000 });
    for (let i = 0; i < 4; i++) await fetch(base);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(warn.mock.calls[0]![0]))).toMatchObject({ msg: 'rate limited', path: '/', who: 'ip', max: 1 });
    expect(String(warn.mock.calls[0]![0])).not.toContain('127.0.0.1');
    warn.mockRestore();
  });

  it('answers 429 with Retry-After once the window is used up, and starts over after it', async () => {
    let t = 1_000_000;
    const base = await start({ max: 3, windowMs: 60_000 }, () => t);
    for (let i = 0; i < 3; i++) expect((await fetch(base)).status).toBe(200);
    t += 20_000;
    const limited = await fetch(base);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('40');
    expect(await limited.json()).toEqual({ ok: false, error: 'too many attempts, try again shortly' });
    t += 40_000;
    expect((await fetch(base)).status).toBe(200);
  });

  it('counts each client address separately, taking it from X-Forwarded-For only behind a trusted proxy', async () => {
    const proxied = await start({ max: 1, windowMs: 60_000 }, undefined, 1);
    expect((await fetch(proxied, { headers: { 'x-forwarded-for': '203.0.113.1' } })).status).toBe(200);
    expect((await fetch(proxied, { headers: { 'x-forwarded-for': '203.0.113.2' } })).status).toBe(200);
    expect((await fetch(proxied, { headers: { 'x-forwarded-for': '203.0.113.1' } })).status).toBe(429);
    // Not behind a proxy, the header is the caller's to forge, so it must not buy a fresh allowance.
    const direct = await start({ max: 1, windowMs: 60_000 });
    expect((await fetch(direct, { headers: { 'x-forwarded-for': '203.0.113.1' } })).status).toBe(200);
    expect((await fetch(direct, { headers: { 'x-forwarded-for': '203.0.113.9' } })).status).toBe(429);
  });

  it('keys an IPv6 address by its /64, so rotating inside one block gains nothing', () => {
    const a = ipKey('2001:db8:1:2:aaaa:bbbb:cccc:dddd');
    expect(ipKey('2001:db8:1:2::1')).toBe(a);
    expect(ipKey('2001:0DB8:0001:0002:ffff:ffff:ffff:ffff')).toBe(a);
    expect(ipKey('2001:db8:1:2:1:2:3:4%eth0')).toBe(a);
    expect(ipKey('2001:db8:1:3::1')).not.toBe(a);
    expect(ipKey('2001:db8:2:2::1')).not.toBe(a);
    expect(ipKey('::1')).toBe('0:0:0:0::/64');
  });

  it('leaves IPv4, IPv4-mapped IPv6 and unparseable values as they are', () => {
    expect(ipKey('203.0.113.7')).toBe('203.0.113.7');
    expect(ipKey('::ffff:203.0.113.7')).toBe('::ffff:203.0.113.7');
    expect(ipKey('::ffff:cb00:7107')).toBe('::ffff:cb00:7107');
    expect(ipKey('::ffff:203.0.113.8')).not.toBe(ipKey('::ffff:203.0.113.7'));
    expect(ipKey('unknown')).toBe('unknown');
    expect(byIp({ ip: undefined } as never)).toBe('unknown');
    expect(byIp({ ip: '203.0.113.7' } as never)).toBe('203.0.113.7');
  });

  it('shares one bucket inside a /64 and separates /64s, through the limiter', () => {
    const handler = rateLimit({ max: 2, windowMs: 60_000 });
    const hit = (ip: string): number => {
      let status = 200;
      handler({ ip, baseUrl: '', path: '/' } as never, { setHeader() {}, status(c: number) { status = c; return this; }, json() {} } as never, () => {});
      return status;
    };
    expect(hit('2001:db8:1:2::1')).toBe(200);
    expect(hit('2001:db8:1:2:9::2')).toBe(200);
    expect(hit('2001:db8:1:2:8:8:8:8')).toBe(429);
    expect(hit('2001:db8:1:3::1')).toBe(200);
    expect(hit('203.0.113.1')).toBe(200);
  });

  it('at the key cap, new keys share one overflow bucket and tracked keys keep their counts', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let n = 0;
    let who = 'abuser';
    const handler = rateLimit({ max: 2, windowMs: 1_000_000 }, () => 5_000_000, () => who);
    const hit = (): number => {
      let status = 200;
      handler({ baseUrl: '', path: '/' } as never, { setHeader() {}, status(c: number) { status = c; return this; }, json() {} } as never, () => {});
      return status;
    };
    expect(hit()).toBe(200);
    expect(hit()).toBe(200);
    expect(hit()).toBe(429);
    for (let i = 0; i < MAX_KEYS; i++) { who = `flood${n++}`; hit(); } // fill the map and push past the cap
    who = 'abuser';
    expect(hit()).toBe(429); // a flood of new keys did not reset the abuser's counter
    who = 'latecomer1';
    const first = [hit(), hit(), hit()];
    who = 'latecomer2';
    expect(hit()).toBe(429); // untracked callers share one limited bucket
    expect(first).toContain(429);
    warn.mockRestore();
  });
});
