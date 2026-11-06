import { useSyncExternalStore } from 'react';

// Whether /api/me last said an admin has suspended this account (brief admin-accounts-screen). Set by every /api/me answer, like qaState.ts, so
// the notice costs no request of its own. False when signed out, and when the answer could not be read (a doubt never shows the notice).
let suspended = false;
const listeners = new Set<() => void>();

export function setSuspended(next: boolean) {
  if (next === suspended) return;
  suspended = next;
  listeners.forEach(l => l());
}

export const getSuspended = (): boolean => suspended;
export const useSuspended = (): boolean => useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getSuspended, () => false);
