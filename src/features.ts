import { useSyncExternalStore } from 'react';
import { ADMIN_KEY } from './lib/gate.js';
import { LS } from './lib/storage.js';

/* ---------- Feature registry (release flags by audience, see feature-flags.md) ----------
   One line per feature that is not for everyone yet:
     'admin' - only an account on the server's ADMIN_EMAILS list sees it (the API tells the app, /api/me `isAdmin`)
     'all'   - everyone (the flag is done: delete the line and the check when you next touch the feature)
     'off'   - nobody, not even an admin
   A feature missing from the list is hidden from everyone (a forgotten line fails closed, not open). Hiding in the browser is not security: a feature with an API route must also
   use `requireAdmin` (server/admin.ts). Add a feature with a line here, then `useFeature('name')` in the component. */
export const FEATURES = {
  grocery: 'all', // Groceries under the Daily tab (ADR 019), released to everyone 2026-10-13 by the owner with a note that the list is kept on this device only (not synced yet): delete this line, the useFeature checks in components/daily/Daily.tsx and components/sheets/ImportSheet.tsx and featureNow('grocery') in the store when next touched
  installHint: 'all', // One-time "install the app" notice on the board for phones that can install, released to everyone 2026-10-13 by the owner: delete this line and the useFeature check in components/board/InstallHint.tsx when next touched
  offlineNotice: 'all', // Slim "Offline" / "Back online, syncing" line under the header when syncing is on, released to everyone 2026-10-13 by the owner: delete this line and the useFeature check in components/OfflineNotice.tsx when next touched
} satisfies Record<string, Audience>;

export type Audience = 'admin' | 'all' | 'off';
export type FeatureName = keyof typeof FEATURES;

/** Pure rule, for tests and the hook. */
export function featureOn(audience: Audience | undefined, isAdmin: boolean): boolean {
  if (audience === 'off') return false;
  if (audience === 'admin') return isAdmin;
  if (audience === 'all') return true;
  return false; // not in the registry: hidden
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
/** useFeature outside React (store code): whether the feature is on for whoever is signed in now. */
export const featureNow = (name: FeatureName): boolean => featureOn((FEATURES as Record<string, Audience>)[name], admin);

export function useFeature(name: FeatureName): boolean {
  const isAdmin = useSyncExternalStore(cb => (listeners.add(cb), () => void listeners.delete(cb)), () => admin);
  return featureOn((FEATURES as Record<string, Audience>)[name], isAdmin);
}
