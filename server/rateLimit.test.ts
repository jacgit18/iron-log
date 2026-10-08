import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, describe, expect, it } from 'vitest';
import { rateLimit } from './rateLimit.ts';

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
});
