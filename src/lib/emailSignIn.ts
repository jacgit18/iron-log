import { LS } from './storage.js';

/* ---------- Showing the email sign-in (ADR 042) ----------
   The server is what keeps the emailed code owner-only (EMAIL_CODE_OPEN); the app only decides whether to offer the form. The sign-in
   screen is shown to people who are not signed in, so "is this an admin" cannot be asked there (src/features.ts learns it after
   sign-in). So: everyone sees the form once the server says the code is open; until then it appears on a device that has opened
   the app once with `?email-signin` in the address, and stays on that device. Not a secret and not security: a stranger who finds
   it gets the usual "sent" answer and no email. */
const KEY = 'emailSignIn'; // LS adds the ironlog: prefix
export const REVEAL_PARAM = 'email-signin';

/** Remembers the reveal when the address asks for it, and says whether this device has it. `search` is `location.search`. */
export function emailSignInRevealed(search: string): boolean {
  if (new URLSearchParams(search).has(REVEAL_PARAM)) LS.set(KEY, true);
  return LS.get(KEY) === true;
}

export const emailSignInOffered = (open: boolean, revealed: boolean) => open || revealed;

/** Loose on purpose: the server and the mailbox are the real check. This only stops an obviously mistyped address from being sent. */
export const looksLikeEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** What to tell the person about each way the code step can go; one sentence each, no colour-only cues. */
export const CODE_MESSAGES = {
  badEmail: 'Enter the email address you sign in with.',
  sendUnreachable: 'Could not reach the server to send a code. Try again in a moment.',
  sendRefused: 'That email address was not accepted. Check it and try again.',
  slowDown: 'Too many tries. Wait a minute, then try again.',
  badCode: 'That code did not work. It may be wrong, already used or expired. Check it, or ask for a new one.',
  codeUnreachable: 'Could not reach the server to check the code. Try again in a moment.',
  sent: 'If that address can sign in, a 6-digit code is on its way. It works for 5 minutes. Check your spam folder too.',
} as const;
