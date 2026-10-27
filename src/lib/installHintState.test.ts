import { describe, it, expect } from 'vitest';
import type { AppState } from '../store/types.js';
import { waitingForSignIn } from './installHintState.js';

type Waiting = Pick<AppState, 'sync' | 'isReady'>;
const state = (sync: { state: string; pausedBecause: string | null } | null, ready = true) => ({ sync, isReady: () => ready }) as unknown as Waiting;

describe('waitingForSignIn', () => {
  it('is false when syncing is off: there is nothing to wait for', () => expect(waitingForSignIn(state(null, false))).toBe(false));
  it('is true while the data has not loaded', () => expect(waitingForSignIn(state({ state: 'idle', pausedBecause: null }, false))).toBe(true));
  it('is true when sync is paused for sign-in or for another account', () => {
    expect(waitingForSignIn(state({ state: 'paused', pausedBecause: 'auth' }))).toBe(true);
    expect(waitingForSignIn(state({ state: 'paused', pausedBecause: 'account' }))).toBe(true);
  });
  it('is false when sync is paused for another reason, or running, with the data loaded', () => {
    expect(waitingForSignIn(state({ state: 'paused', pausedBecause: 'offline' }))).toBe(false);
    expect(waitingForSignIn(state({ state: 'idle', pausedBecause: null }))).toBe(false);
  });
});
