import { request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { canonicalRedirect } from './canonicalHost.ts';

const BASE = 'https://loadbearer.app';
const OLD = 'iron-log-947510572244.us-central1.run.app';
const nav = { method: 'GET', host: OLD, fetchMode: 'navigate', url: '/' };

describe('canonicalRedirect (a browser on the old Cloud Run address goes to BASE_URL)', () => {
  it('sends a top-level navigation on the old address to the custom domain, keeping the path and query', () => {
    expect(canonicalRedirect(BASE, nav)).toBe('https://loadbearer.app/');
    expect(canonicalRedirect(BASE, { ...nav, url: '/privacy.html?x=1' })).toBe('https://loadbearer.app/privacy.html?x=1');
    expect(canonicalRedirect(BASE, { ...nav, method: 'HEAD' })).toBe('https://loadbearer.app/');
    expect(canonicalRedirect(BASE, { ...nav, host: OLD.toUpperCase() })).toBe('https://loadbearer.app/');
  });

  it('leaves everything else alone', () => {
    expect(canonicalRedirect(undefined, nav)).toBeNull(); // sign-in off, or no BASE_URL
    expect(canonicalRedirect(BASE, { ...nav, host: 'loadbearer.app' })).toBeNull(); // already there
    expect(canonicalRedirect(BASE, { ...nav, fetchMode: undefined })).toBeNull(); // curl, the deploy smoke checks, Cloud Tasks
    expect(canonicalRedirect(BASE, { ...nav, fetchMode: 'cors' })).toBeNull(); // fetch() from a page
    expect(canonicalRedirect(BASE, { ...nav, fetchMode: 'same-origin' })).toBeNull();
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(canonicalRedirect(BASE, { ...nav, method }), method).toBeNull();
    for (const url of ['/api', '/api/health', '/api/health/db', '/api/me', '/api/auth/callback/google', '/api?x=1']) expect(canonicalRedirect(BASE, { ...nav, url }), url).toBeNull();
    expect(canonicalRedirect(BASE, { ...nav, host: `candidate---${OLD}` })).toBeNull(); // a tagged candidate address is checked directly by the deploy
    expect(canonicalRedirect(BASE, { ...nav, host: 'localhost:3002' })).toBeNull(); // not a Cloud Run address
    expect(canonicalRedirect(BASE, { ...nav, host: undefined })).toBeNull();
  });

  it('does not redirect a service whose BASE_URL is its own Cloud Run address (staging, QA, or production before the domain)', () => {
    expect(canonicalRedirect(`https://${OLD}`, nav)).toBeNull();
    expect(canonicalRedirect('https://iron-log-staging-947510572244.us-central1.run.app', { ...nav, host: 'iron-log-staging-947510572244.us-central1.run.app' })).toBeNull();
  });

  it('does not match a look-alike host', () => {
    expect(canonicalRedirect(BASE, { ...nav, host: 'evil.example' })).toBeNull();
    expect(canonicalRedirect(BASE, { ...nav, host: 'x.run.app.evil.example' })).toBeNull();
  });
});

// Through the real app on a free port, setting the Host and Sec-Fetch-Mode headers that fetch() will not let a script choose.
describe('canonicalHost in the app', () => {
  let server: Server;
  let port: number;
  beforeAll(async () => {
    server = createApp({ canonicalOrigin: BASE }).listen(0);
    await new Promise(done => server.once('listening', done));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>(done => server.close(() => done())));

  const get = (path: string, headers: Record<string, string>) =>
    new Promise<{ status: number; location?: string }>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port, path, method: 'GET', headers }, res => {
        res.resume();
        resolve({ status: res.statusCode ?? 0, location: res.headers.location });
      });
      req.on('error', reject);
      req.end();
    });

  it('answers a browser navigation on the old address with a temporary redirect', async () => {
    const res = await get('/privacy.html?x=1', { host: OLD, 'sec-fetch-mode': 'navigate' });
    expect(res.status).toBe(307);
    expect(res.location).toBe('https://loadbearer.app/privacy.html?x=1');
  });

  it('does not redirect the same address without the browser header, or an API path', async () => {
    expect((await get('/api/health', { host: OLD })).status).toBe(200);
    expect((await get('/api/health', { host: OLD, 'sec-fetch-mode': 'navigate' })).status).toBe(200);
    expect((await get('/', { host: OLD })).status).not.toBe(307);
  });
});
