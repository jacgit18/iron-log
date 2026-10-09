import { useSyncExternalStore } from 'react';
import { ADMIN_KEY } from './lib/gate.js';
import { LS } from './lib/storage.js';

/* ---------- Feature registry (release flags by audience, see feature-flags.md) ----------
   One line per feature that is not for everyone yet:
     'admin' - only an account on the server's ADMIN_EMAILS list sees it (the API tells the app, /api/me `isAdmin`)
     'all'   - everyone (the flag is done: delete the line and the check when you next touch the feature)
     'off'   - nobody, not even an admin
   A feature missing from the list is on for everyone. Hiding in the browser is not security: a feature with an API route must also
   use `requireAdmin` (server/admin.ts). Add a feature with a line here, then `useFeature('name')` in the component. */
export const FEATURES = {
  // exampleFeature: 'admin',
} satisfies Record<string, Audience>;

export type Audience = 'admin' | 'all' | 'off';
export type FeatureName = keyof typeof FEATURES;

/** Pure rule, for tests and the hook. */
export function featureOn(audience: Audience | undefined, isAdmin: boolean): boolean {
  if (audience === 'off') return false;
  if (audience === 'admin') return isAdmin;
  return true;
}

// What the browser last learned about this account. Kept in storage so an admin still sees the feature offline; the default (and any
// doubt) is "not an admin", so a feature is never shown by mistake.
let admin = LS.get(ADMIN_KEY) === true;
const listeners = new Set<() => void>();

/** Called with what /api/me said, and with false when the account is signed out. */
export function setAdmin(value: boolean) {
  if (value === admin) return;
  admin = value;
  LS.set(ADMIN_KEY, value);
  listeners.forEach(l => l());
}

export const isAdminNow = () => admin;

export function useFeature(name: FeatureName): boolean {
  const isAdmin = useSyncExternalStore(cb => (listeners.add(cb), () => void listeners.delete(cb)), () => admin);
  return featureOn((FEATURES as Record<string, Audience>)[name], isAdmin);
}
