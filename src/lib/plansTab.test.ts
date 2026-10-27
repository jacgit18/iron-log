import { describe, expect, it } from 'vitest';
import type { AccountState } from '../sync/account.js';
import { PLAN_CARDS, showPlansTab } from './plansTab.js';

const billing = { available: true, source: 'manual', status: null, renewsAt: null, hasCustomer: false };
const signedIn = (extra: Partial<Extract<AccountState, { status: 'signed-in' }>> = {}): AccountState => ({ status: 'signed-in', userId: 'u1', kind: 'session', email: 'jo@example.com', name: 'Jo', isAdmin: false, isPaid: false, plan: 'free', billing, ...extra });

describe('showPlansTab', () => {
  it('is drawn for a signed-in free account with billing on, on a wide screen', () => {
    expect(showPlansTab(true, signedIn())).toBe(true);
  });
  it('is not drawn on a phone', () => {
    expect(showPlansTab(false, signedIn())).toBe(false);
  });
  it('is not drawn inside the Android app, even on a wide screen for a free account', () => {
    expect(showPlansTab(true, signedIn(), true)).toBe(false);
    expect(showPlansTab(true, signedIn(), false)).toBe(true);
  });
  it('is not drawn before the first answer, signed out, or when the server could not be reached', () => {
    expect(showPlansTab(true, null)).toBe(false);
    expect(showPlansTab(true, { status: 'signed-out' })).toBe(false);
    expect(showPlansTab(true, { status: 'unreachable' })).toBe(false);
  });
  it('is not drawn once there is a plan to manage, or when billing is off', () => {
    for (const plan of ['paid', 'lifetime', 'founder', 'beta']) expect(showPlansTab(true, signedIn({ plan, isPaid: plan !== 'beta' }))).toBe(false);
    expect(showPlansTab(true, signedIn({ billing: { ...billing, available: false } }))).toBe(false);
    expect(showPlansTab(true, signedIn({ billing: undefined }))).toBe(false);
  });
  it('reads a missing plan from isPaid', () => {
    expect(showPlansTab(true, signedIn({ plan: undefined }))).toBe(true);
    expect(showPlansTab(true, signedIn({ plan: undefined, isPaid: true }))).toBe(false);
  });
});

describe('PLAN_CARDS', () => {
  it('names Free, Plus and Pro, with the Stripe prices on Plus and none on Pro', () => {
    expect(PLAN_CARDS.map(p => p.name)).toEqual(['Free', 'Plus', 'Pro']);
    expect(PLAN_CARDS[1].price).toBe('$5.99 a month, or $49.99 a year');
    expect(PLAN_CARDS[2].price).not.toMatch(/\$\d/);
  });
});
