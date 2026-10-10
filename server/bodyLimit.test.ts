import http from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bodyLimit } from './bodyLimit.ts';

let server: http.Server;
let port: number;
let reached = 0;

beforeAll(async () => {
  const app = express();
  app.use('/auth', bodyLimit(100));
  app.all('/auth/*splat', (req, res) => { reached++; req.resume(); req.on('end', () => res.json({ ok: true })); });
  server = app.listen(0);
  await new Promise(done => server.once('listening', done));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>(done => server.close(() => done())));

const post = (body: string | null, headers: http.OutgoingHttpHeaders = {}): Promise<{ status: number; text: string }> =>
  new Promise((resolve, reject) => {
    const req = http.request({ port, path: '/auth/sign-out', method: 'POST', headers }, res => {
      let text = '';
      res.on('data', c => (text += c));
      res.on('end', () => resolve({ status: res.statusCode!, text }));
    });
    req.on('error', reject);
    if (body !== null) req.write(body);
    req.end();
  });

describe('the size limit on the sign-in routes', () => {
  it('lets a small body through to the route, intact', async () => {
    reached = 0;
    const out = await post('x'.repeat(100), { 'content-length': 100 });
    expect(out.status).toBe(200);
    expect(reached).toBe(1);
  });

  it('refuses a body that declares more than the limit, without the route ever running', async () => {
    reached = 0;
    const out = await post('x'.repeat(101), { 'content-length': 101 });
    expect(out.status).toBe(413);
    expect(JSON.parse(out.text)).toMatchObject({ ok: false, error: { code: 'too-large' } });
    expect(reached).toBe(0);
  });

  it('refuses a body with no length (chunked), which cannot be judged before it is read', async () => {
    reached = 0;
    const out = await post('x'.repeat(50), { 'transfer-encoding': 'chunked' });
    expect(out.status).toBe(413);
    expect(reached).toBe(0);
  });

  it('refuses a length that is not a number, and lets a request with no body through', async () => {
    reached = 0;
    expect((await post(null, { 'content-length': 'abc' })).status).toBe(400); // Node itself rejects it before the middleware
    expect((await post(null, { 'content-length': 0 })).status).toBe(200);
    expect(reached).toBe(1);
  });
});
