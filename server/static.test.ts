import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';

// ADR 010: the API also serves the built PWA, so the app and the API share one origin. No database is needed for this.
let dir: string;
let server: Server;
let base: string;
let bare: Server;
let bareBase: string;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'ironlog-static-'));
  mkdirSync(join(dir, 'assets'));
  mkdirSync(join(dir, 'icons'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Loadbearer</title>');
  writeFileSync(join(dir, 'delete-account.html'), '<!doctype html><title>Delete your account</title>');
  writeFileSync(join(dir, 'sw.js'), '// service worker');
  writeFileSync(join(dir, 'workbox-2fbc6a65.js'), '// workbox');
  writeFileSync(join(dir, 'manifest.webmanifest'), '{}');
  writeFileSync(join(dir, 'assets', 'index-AbC123.js'), 'console.log(1)');
  writeFileSync(join(dir, 'assets', 'big-AbC123.js'), 'console.log("x");'.repeat(500));
  writeFileSync(join(dir, 'icons', 'icon-192.png'), 'png');
  server = createApp({ staticDir: dir }).listen(0);
  bare = createApp({}).listen(0);
  await Promise.all([server, bare].map(s => new Promise(done => s.once('listening', done))));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  bareBase = `http://127.0.0.1:${(bare.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await Promise.all([server, bare].map(s => new Promise<void>(done => s.close(() => done()))));
  rmSync(dir, { recursive: true, force: true });
});

const get = (path: string, init?: RequestInit) => fetch(base + path, init);

describe('compression', () => {
  it('compresses a large script for a client that accepts it, and leaves it plain for one that does not', async () => {
    const packed = await get('/assets/big-AbC123.js', { headers: { 'accept-encoding': 'gzip' } });
    expect(packed.headers.get('content-encoding')).toBe('gzip');
    const plain = await get('/assets/big-AbC123.js', { headers: { 'accept-encoding': 'identity' } });
    expect(plain.headers.get('content-encoding')).toBeNull();
  });
});

describe('serving the PWA', () => {
  it('serves index.html at the root and re-checks it every time', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    expect(await res.text()).toContain('Loadbearer');
  });

  it.each(['/sw.js', '/workbox-2fbc6a65.js', '/manifest.webmanifest', '/index.html'])('never caches %s, so an update reaches the phone', async path => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-cache');
  });

  it('caches hashed files under /assets/ for a year', async () => {
    const res = await get('/assets/index-AbC123.js');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('caches other files, such as icons, for an hour', async () => {
    const res = await get('/icons/icon-192.png');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600');
  });

  it('gives a page route the app, so a reload or a deep link works', async () => {
    for (const path of ['/board', '/progress/week/2026-10-04']) {
      const res = await get(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get('cache-control')).toBe('no-cache');
      expect(await res.text()).toContain('Loadbearer');
    }
  });

  it('answers HEAD for a page', async () => {
    expect((await get('/board', { method: 'HEAD' })).status).toBe(200);
  });

  it('keeps a missing file a 404 instead of answering with HTML', async () => {
    for (const path of ['/assets/old-Zz9.js', '/nope.css', '/icons/missing.png']) {
      const res = await get(path);
      expect(res.status, path).toBe(404);
      expect(await res.text()).not.toContain('Loadbearer');
    }
  });

  it('has nothing under /.well-known, as on GitHub Pages', async () => {
    const res = await get('/.well-known/ai-catalog.json');
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain('Loadbearer');
  });

  it('does not answer a write to a page route with the app', async () => {
    expect((await get('/board', { method: 'POST' })).status).toBe(404);
  });
});

describe('the public account-deletion page', () => {
  it.each(['/delete-account', '/delete-account/', '/delete-account.html'])('serves %s as the page itself, not the app, with no sign-in', async path => {
    const res = await get(path);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('Delete your account');
    expect(body).not.toContain('<title>Loadbearer</title>');
  });

  it('answers HEAD and a query string, and leaves a write alone', async () => {
    expect((await get('/delete-account', { method: 'HEAD' })).status).toBe(200);
    expect((await get('/delete-account?from=play')).status).toBe(200);
    expect((await get('/delete-account', { method: 'POST' })).status).toBe(404);
  });

  it('falls through to the app, not a 500, when the page file is missing from the build', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'ironlog-nodelete-'));
    writeFileSync(join(empty, 'index.html'), '<!doctype html><title>Loadbearer</title>');
    const s = createApp({ staticDir: empty }).listen(0);
    await new Promise(done => s.once('listening', done));
    try {
      // The app answers a page route; the missing file must not turn into a 500.
      expect((await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/delete-account`)).status).toBe(200);
    } finally {
      await new Promise<void>(done => s.close(() => done()));
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

describe('the API next to the PWA', () => {
  it('still answers /api/health', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('never answers an /api path with the app', async () => {
    for (const path of ['/api', '/api/nope', '/api/commands/nope']) {
      const res = await get(path);
      expect(res.headers.get('content-type'), path).toContain('application/json');
      expect(await res.text(), path).not.toContain('Loadbearer');
    }
  });
});

describe('without a built PWA', () => {
  it('serves only the API: a page route is a 404, health still works', async () => {
    expect((await fetch(`${bareBase}/board`)).status).toBe(404);
    expect((await fetch(`${bareBase}/api/health`)).status).toBe(200);
  });

  it('serves only the API when the directory has no index.html', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'ironlog-empty-'));
    const s = createApp({ staticDir: empty }).listen(0);
    await new Promise(done => s.once('listening', done));
    try {
      expect((await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/`)).status).toBe(404);
    } finally {
      await new Promise<void>(done => s.close(() => done()));
      rmSync(empty, { recursive: true, force: true });
    }
  });
});

// A checkout under a hidden folder (.claude/worktrees/..., as the agent worktrees are) must still serve the page: the file sender
// refuses a full path that contains a dot-directory unless the folder is passed as `root`.
describe('a build under a hidden folder', () => {
  it('serves the app page for a page route', async () => {
    const hidden = mkdtempSync(join(tmpdir(), 'ironlog-hidden-'));
    const out = join(hidden, '.worktrees', 'dist');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'index.html'), '<!doctype html><title>Hidden</title>');
    const s = createApp({ staticDir: out }).listen(0);
    await new Promise(done => s.once('listening', done));
    try {
      const r = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/`);
      expect(r.status).toBe(200);
      expect(await r.text()).toContain('Hidden');
    } finally { await new Promise<void>(done => s.close(() => done())); rmSync(hidden, { recursive: true, force: true }); }
  });
});
