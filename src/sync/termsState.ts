import { useSyncExternalStore } from 'react';
import { termsDecision, type StoredTerms, type TermsDecision } from '../lib/termsGate.js';
import { CURRENT_TERMS } from '../shared/termsVersion.js';

// What /api/me last said about the Terms and Privacy acceptance (brief terms-acceptance): null while nothing is owed (accepted, signed out, offline, or an
// answer that could not be read: a doubt never blocks the app). Set by every /api/me answer, like suspendedState.ts, so the gate costs no request of its own.
let owed: TermsDecision | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach(l => l());

/** `accepted` is the server's verdict; `stored` is what the account holds, used to word the screen. */
export function setTerms(next: { accepted: boolean; stored: StoredTerms } | null) {
  let value: TermsDecision | null = null;
  if (next && !next.accepted) {
    const d = termsDecision(CURRENT_TERMS, next.stored);
    value = d.needed ? d : { ...d, needed: true, changed: ['terms', 'privacy'] }; // the server wants more than this bundle knows (a newer deploy): ask for both
  }
  if (value === null && owed === null) return;
  if (value && owed && value.first === owed.first && value.changed.join() === owed.changed.join()) return;
  owed = value;
  emit();
}

export const getTermsOwed = (): TermsDecision | null => owed;
export const useTermsOwed = (): TermsDecision | null => useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getTermsOwed, () => null);
