import { useSyncExternalStore } from 'react';
import { ADMIN_KEY, PAID_KEY } from './lib/gate.js';
import { LS } from './lib/storage.js';

/* ---------- Feature registry (release flags by audience, see feature-flags.md) ----------
   One line per feature that is not for everyone yet:
     'admin' - only an account on the server's ADMIN_EMAILS list sees it (the API tells the app, /api/me `isAdmin`)
     'paid'  - a paid subscriber (the account's plan is paid, lifetime or founder, see server/plan.ts) and any admin (the API tells the
               app, /api/me `isPaid`)
     'all'   - everyone (the flag is done: delete the line and its check in the same PR, not later; lines left behind are where
               parallel PRs conflict)
     'off'   - nobody, not even an admin
   A feature missing from the list is hidden from everyone (a forgotten line fails closed, not open). Hiding in the browser is not security: a feature with an API route must also
   use `requireAdmin` (server/admin.ts), or `requirePaid` (server/plan.ts) for a 'paid' feature. Add a feature with a line here, in alphabetical order, then `useFeature('name')` in the component. */
export const FEATURES = {
  adminIssues: 'admin', // Production issues in Settings (ADR 013 amendment): an internal tool, so it stays admin-only for good; remove it only together with /api/issues and the Issues panel
} satisfies Record<string, Audience>;

export type Audience = 'admin' | 'all' | 'off' | 'paid';
export type FeatureName = keyof typeof FEATURES;

/** Pure rule, for tests and the hook. */
export function featureOn(audience: Audience | undefined, isAdmin: boolean, isPaid = false): boolean {
  if (audience === 'off') return false;
  if (audience === 'admin') return isAdmin;
  if (audience === 'paid') return isPaid || isAdmin;
  if (audience === 'all') return true;
  return false; // not in the registry: hidden
}

// What the browser last learned about this account. Kept in storage so an admin still sees the feature offline; the default (and any
// doubt) is "not an admin", so a feature is never shown by mistake.
let admin = LS.get(ADMIN_KEY) === true;
let paid = LS.get(PAID_KEY) === true;
const listeners = new Set<() => void>();

/** Called with what /api/me said, and with false when the account is signed out. */
export function setAdmin(value: boolean) {
  if (value === admin) return;
  admin = value;
  LS.set(ADMIN_KEY, value);
  listeners.forEach(l => l());
}

/** Called with what /api/me said (isPaid), and with false when the account is signed out. */
export function setPaid(value: boolean) {
  if (value === paid) return;
  paid = value;
  LS.set(PAID_KEY, value);
  listeners.forEach(l => l());
}

export const isAdminNow = () => admin;
/** useFeature outside React (store code): whether the feature is on for whoever is signed in now. */
export const featureNow = (name: FeatureName): boolean => featureOn((FEATURES as Record<string, Audience>)[name], admin, paid);

export function useFeature(name: FeatureName): boolean {
  // One number for both flags, so the hook re-renders when either changes.
  const flags = useSyncExternalStore(cb => (listeners.add(cb), () => void listeners.delete(cb)), () => (admin ? 1 : 0) + (paid ? 2 : 0));
  return featureOn((FEATURES as Record<string, Audience>)[name], (flags & 1) === 1, (flags & 2) === 2);
}
