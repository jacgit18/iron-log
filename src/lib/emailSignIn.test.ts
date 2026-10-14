import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emailSignInOffered, emailSignInRevealed, looksLikeEmail } from './emailSignIn.js';

describe('emailSignInRevealed', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('is off on a device that never asked', () => {
    expect(emailSignInRevealed('')).toBe(false);
    expect(emailSignInRevealed('?other=1')).toBe(false);
  });
  it('turns on when the address carries ?email-signin, and then stays on without it', () => {
    expect(emailSignInRevealed('?email-signin')).toBe(true);
    expect(emailSignInRevealed('')).toBe(true);
  });
  it('is off, not an error, when the browser refuses storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
    expect(emailSignInRevealed('?email-signin')).toBe(false);
  });
});

describe('emailSignInOffered', () => {
  it('is offered when the server has it open or this device revealed it', () => {
    expect([emailSignInOffered(false, false), emailSignInOffered(true, false), emailSignInOffered(false, true)]).toEqual([false, true, true]);
  });
});

describe('looksLikeEmail', () => {
  it('stops an obvious typo and nothing else', () => {
    for (const ok of ['a@b.co', ' a@b.co ', 'first.last+tag@mail.example.com']) expect(looksLikeEmail(ok)).toBe(true);
    for (const bad of ['', 'a', 'a@b', '@b.co', 'a b@c.co', 'a@b .co']) expect(looksLikeEmail(bad)).toBe(false);
  });
});
