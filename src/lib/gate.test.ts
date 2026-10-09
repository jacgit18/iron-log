import { describe, expect, it } from 'vitest';
import type { AccountState } from '../sync/account.js';
import { decideGate, forgetSession, KNOWN_KEY, quickGate } from './gate.js';

const store = (initial: Record<string, unknown> = {}) => {
  const data = new Map(Object.entries(initial));
  return { data, get: (k: string) => data.get(k) ?? null, set: (k: string, v: unknown) => void data.set(k, v), remove: (k: string) => void data.delete(k) };
};
const signedIn: AccountState = { status: 'signed-in', userId: 'u1', kind: 'session', email: 'a@b.co', name: null , isAdmin: false};

describe('quickGate', () => {
  it('syncing off: always the app, even for a stranger', () => {
    expect(quickGate(false, store())).toBe('app');
  });
  it('a browser that has seen a signed-in session goes straight to the app', () => {
    expect(quickGate(true, store({ [KNOWN_KEY]: true }))).toBe('app');
  });
  it('anyone else has to be asked', () => {
    expect(quickGate(true, store())).toBe('check');
    expect(quickGate(true, store({ [KNOWN_KEY]: 'yes' }))).toBe('check'); // only the real marker counts
  });
});

describe('decideGate', () => {
  it('signed in: the app, and the browser remembers', async () => {
    const s = store();
    expect(await decideGate(async () => signedIn, s)).toBe('app');
    expect(s.data.get(KNOWN_KEY)).toBe(true);
  });
  it('a definite "not signed in" is the landing page, and nothing is remembered', async () => {
    const s = store();
    expect(await decideGate(async () => ({ status: 'signed-out' }), s)).toBe('landing');
    expect(s.data.has(KNOWN_KEY)).toBe(false);
  });
  it('could not tell: the app if the device already holds an account\'s data, never a landing page in front of it', async () => {
    expect(await decideGate(async () => ({ status: 'unreachable' }), store({ 'sync/owner': { userId: 'u1' } }))).toBe('app');
  });
  it('could not tell, and nothing here: the landing page with an offline note, not a blank app', async () => {
    expect(await decideGate(async () => ({ status: 'unreachable' }), store())).toBe('landing-offline');
  });
});

describe('forgetSession', () => {
  it('removes the marker so the next load starts at the landing page', () => {
    const s = store({ [KNOWN_KEY]: true });
    forgetSession(s);
    expect(quickGate(true, s)).toBe('check');
  });
});
