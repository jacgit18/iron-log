import type { TermsVersions } from '../shared/termsVersion.js';

// Whether a signed-in account must accept the Terms and the Privacy Policy before the app opens (brief terms-acceptance). Pure: the server sends
// what the account stored, the app knows the current versions, and this says what to ask. `null` for a stored value means "never accepted".
export interface StoredTerms { terms: string | null; privacy: string | null }
export type TermsPage = 'terms' | 'privacy';
export interface TermsDecision {
  needed: boolean;
  /** Never accepted anything: the screen says "Accept", not "We updated". */
  first: boolean;
  /** Which pages are not accepted at their current version. */
  changed: TermsPage[];
}

export function termsDecision(current: TermsVersions, stored: StoredTerms): TermsDecision {
  const changed: TermsPage[] = [];
  if (stored.terms !== current.terms) changed.push('terms');
  if (stored.privacy !== current.privacy) changed.push('privacy');
  return { needed: changed.length > 0, first: stored.terms === null && stored.privacy === null, changed };
}

const NAMES: Record<TermsPage, string> = { terms: 'Terms of Use', privacy: 'Privacy Policy' };

/** The line above the checkbox: "Accept the Terms of Use and the Privacy Policy" the first time, "We updated our Privacy Policy" after a bump. */
export function termsHeading(d: TermsDecision): string {
  if (d.first) return 'Before you continue';
  return `We updated our ${d.changed.map(p => NAMES[p]).join(' and ')}`;
}

/** The one tick the sign-in card remembers across the Google redirect or the email-code reload, so the person is not asked twice. */
export const TERMS_TICK_KEY = 'terms/ticked';
export const TICK_MAX_AGE_MS = 10 * 60_000;

/** Parses what was stored under TERMS_TICK_KEY (a millisecond time): true only when it is a recent time, so a stale tick from days ago never counts. */
export function tickIsFresh(raw: string | null, now: number): boolean {
  if (!raw) return false;
  const at = Number(raw);
  return Number.isFinite(at) && at <= now && now - at <= TICK_MAX_AGE_MS;
}
