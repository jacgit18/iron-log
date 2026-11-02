import { hasQaLink, qaLinkFromSearch, searchWithoutQaLink } from '../lib/qaPersonas.js';

/* ---------- The /?qa=<account id> link, read once (brief qa-scenarios) ----------
   Read when this file first loads, which is at start. The parameter leaves the address at once, so a reload or a shared address does not repeat it,
   and the id waits in memory until QaDeepLink may use it. It follows the share link's pattern (lib/shareTarget.ts). */

let held: string | null = null;
if (typeof location !== 'undefined' && hasQaLink(location.search)) {
  held = qaLinkFromSearch(location.search);
  try { history.replaceState(null, '', location.pathname + searchWithoutQaLink(location.search) + location.hash); } catch { /* ignore */ }
}

/** The id the link asked for, once: asking again returns nothing. */
export function takeQaLink(): string | null { const id = held; held = null; return id; }
export const hasHeldQaLink = (): boolean => held !== null;
