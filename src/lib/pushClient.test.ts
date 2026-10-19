import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../test/browserStubs.js';
import { mem } from '../test/browserStubs.js';

// vi.mock is hoisted above the imports, so the flag it returns is a plain holder the tests change.
import { cancelPush, disablePush, enablePush, pushCovers, pushKindOn, pushOn, renewPush, schedulePush, setPushKind } from './pushClient.js';

const saved: Record<string, PropertyDescriptor | undefined> = {};
const put = (k: string, v: unknown) => { if (!(k in saved)) saved[k] = Object.getOwnPropertyDescriptor(globalThis, k); Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); };
const restore = () => { for (const k of Object.keys(saved)) { if (saved[k]) Object.defineProperty(globalThis, k, saved[k]!); else delete (globalThis as Record<string, unknown>)[k]; delete saved[k]; } };

type Call = { path: string; method: string; body: unknown };
let calls: Call[];
let answers: Record<string, { status: number; json?: unknown }>;
let sub: { endpoint: string; toJSON(): unknown; unsubscribe: ReturnType<typeof vi.fn> } | null;
let subscribe: ReturnType<typeof vi.fn>;
const KEY = 'B'.repeat(87);

function setup(permission: 'default' | 'granted' | 'denied' = 'granted', ask: 'granted' | 'denied' = 'granted') {
  const N = vi.fn() as unknown as { permission: string; requestPermission: ReturnType<typeof vi.fn> };
  N.permission = permission;
  N.requestPermission = vi.fn(async () => { N.permission = ask; return ask; });
  put('Notification', N);
  put('PushManager', function PushManager() {});
  subscribe = vi.fn(async () => { sub = { endpoint: 'https://push.example/e1', toJSON: () => ({ endpoint: 'https://push.example/e1', keys: { p256dh: 'k', auth: 'a' } }), unsubscribe: vi.fn(async () => true) }; return sub; });
  put('navigator', { onLine: true, serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: async () => sub, subscribe } }) } });
  put('fetch', vi.fn(async (url: string, init: RequestInit) => {
    const path = url.replace('/api/push', '');
    calls.push({ path, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined });
    const a: { status: number; json?: unknown } = answers[path] ?? { status: 200, json: { ok: true } };
    return { ok: a.status >= 200 && a.status < 300, status: a.status, json: async () => a.json ?? {} };
  }));
    return N;
}
const settle = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => { for (const k of Object.keys(mem)) delete (mem as Record<string, unknown>)[k]; calls = []; answers = { '/key': { status: 200, json: { ok: true, publicKey: KEY } } }; sub = null; (globalThis as Record<string, unknown>).__APP_VERSION__ = 'test'; });
afterEach(() => { restore(); vi.clearAllMocks(); });

describe('enablePush', () => {
  it('is unsupported without a push manager', async () => {
    setup(); delete (globalThis as Record<string, unknown>).PushManager;
    expect(await enablePush()).toBe('unsupported');
  });
  it('asks the browser once, subscribes with the server key, tells the server, and is on', async () => {
    const N = setup('default');
    expect(await enablePush()).toBe('on');
    expect(N.requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: expect.any(Uint8Array) });
    expect(calls.map(c => `${c.method} ${c.path}`)).toEqual(['GET /key', 'POST /subscribe']);
    expect(calls[1]!.body).toEqual({ endpoint: 'https://push.example/e1', keys: { p256dh: 'k', auth: 'a' } });
    expect(pushOn()).toBe(true);
  });
  it('is denied, and stays off, when the person says no', async () => {
    setup('default', 'denied');
    expect(await enablePush()).toBe('denied');
    expect(calls).toEqual([]);
    expect(pushOn()).toBe(false);
  });
  it('is unavailable when the server has no key for this account (not an admin, or no keys)', async () => {
    setup(); answers['/key'] = { status: 403 };
    expect(await enablePush()).toBe('unavailable');
    expect(subscribe).not.toHaveBeenCalled();
    expect(pushOn()).toBe(false);
  });
  it('fails, and gives the new browser subscription back, when the server will not take it', async () => {
    setup(); answers['/subscribe'] = { status: 500 };
    expect(await enablePush()).toBe('failed');
    expect(sub!.unsubscribe).toHaveBeenCalled();
    expect(pushOn()).toBe(false);
  });
  it('reuses a subscription the browser already has', async () => {
    setup(); await enablePush(); calls = []; subscribe.mockClear();
    expect(await enablePush()).toBe('on');
    expect(subscribe).not.toHaveBeenCalled();
    expect(calls.map(c => c.path)).toEqual(['/subscribe']);
  });
});

describe('disablePush', () => {
  it('tells the server, drops the browser subscription, and turns off', async () => {
    setup(); await enablePush(); calls = [];
    const s = sub!;
    await disablePush();
    expect(calls).toEqual([{ path: '/unsubscribe', method: 'POST', body: { endpoint: 'https://push.example/e1' } }]);
    expect(s.unsubscribe).toHaveBeenCalled();
    expect(pushOn()).toBe(false);
  });
  it('does nothing when it was never on (sign-out for everyone else)', async () => {
    setup();
    await disablePush();
    expect(calls).toEqual([]);
  });
});

describe('renewPush', () => {
  it('puts a dropped subscription back and renews the server copy', async () => {
    setup(); await enablePush(); sub = null; calls = [];
    await renewPush();
    expect(calls.map(c => c.path)).toEqual(['/key', '/subscribe']);
  });
  it('does nothing when push is off', async () => {
    setup(); await renewPush();
    expect(calls).toEqual([]);
  });
});

describe('schedulePush and cancelPush', () => {
  it('send nothing when push is off, for a kind that is unticked, or when offline', async () => {
    setup();
    schedulePush('rest', 'k', Date.now() + 5000, 'x'); await settle();
    expect(calls).toEqual([]);
    await enablePush(); calls = [];
    setPushKind('rest', false);
    schedulePush('rest', 'k', Date.now() + 5000, 'x'); await settle(); await settle();
    expect(calls.map(c => c.path)).toEqual(['/cancel']); // unticking took back what was asked; the new schedule is refused
    expect(pushKindOn('rest')).toBe(false);
    calls = [];
    setPushKind('rest', true);
    put('navigator', { onLine: false, serviceWorker: { ready: Promise.resolve({ pushManager: { getSubscription: async () => sub } }) } });
    schedulePush('rest', 'k', Date.now() + 5000, 'x'); await settle();
    expect(calls).toEqual([]);
  });
  it('a cancel still goes out after the kind\'s box is unticked, and unticking the box sends one', async () => {
    setup(); await enablePush(); calls = [];
    setPushKind('day-nudge', false); await settle(); await settle();
    expect(calls).toEqual([{ path: '/cancel', method: 'POST', body: { endpoint: 'https://push.example/e1', kind: 'day-nudge' } }]);
    calls = [];
    cancelPush('day-nudge'); await settle(); await settle();
    expect(calls.map(c => c.path)).toEqual(['/cancel']);
    expect(pushKindOn('day-nudge')).toBe(false); // while a schedule of that kind is still refused
    schedulePush('day-nudge', 'n', Date.now() + 5000, 'x'); await settle();
    expect(calls).toHaveLength(1);
  });
  it('post the device endpoint, kind, key, time and body, and remember what the server took', async () => {
    setup(); await enablePush(); calls = [];
    const at = Date.now() + 90_000;
    schedulePush('rest', '123', at, 'Rest over.'); await settle(); await settle();
    expect(calls).toEqual([{ path: '/schedule', method: 'POST', body: { endpoint: 'https://push.example/e1', kind: 'rest', key: '123', at, body: 'Rest over.' } }]);
    expect(pushCovers('rest', '123')).toBe(true);
    expect(pushCovers('rest', '124')).toBe(false);
  });
  it('do not claim cover when the server refuses', async () => {
    setup(); await enablePush(); calls = []; answers['/schedule'] = { status: 502 };
    schedulePush('rest', '9', Date.now() + 5000, 'x'); await settle(); await settle();
    expect(pushCovers('rest', '9')).toBe(false);
  });
  it('a cancel with a key withdraws the cover and goes out after the schedule before it', async () => {
    setup(); await enablePush(); calls = [];
    schedulePush('rest', '5', Date.now() + 5000, 'x');
    cancelPush('rest', '5');
    await settle(); await settle(); await settle();
    expect(calls.map(c => c.path)).toEqual(['/schedule', '/cancel']);
    expect(calls[1]!.body).toEqual({ endpoint: 'https://push.example/e1', kind: 'rest', key: '5' });
    expect(pushCovers('rest', '5')).toBe(false);
  });
  it('cut a body to 140 characters', async () => {
    setup(); await enablePush(); calls = [];
    schedulePush('day-nudge', 'n', Date.now() + 5000, 'x'.repeat(200)); await settle(); await settle();
    expect((calls[0]!.body as { body: string }).body).toHaveLength(140);
  });
  it('stay quiet when the network or the server fails', async () => {
    setup(); await enablePush();
    put('fetch', vi.fn(async () => { throw new Error('offline'); }));
    schedulePush('rest', '1', Date.now() + 5000, 'x'); cancelPush('rest'); await settle(); await settle();
    expect(pushCovers('rest', '1')).toBe(false);
  });
});
