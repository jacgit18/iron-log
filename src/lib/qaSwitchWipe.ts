/* ---------- QA: skip the wipe card after a switch (brief: qa-auto-wipe-on-switch) ----------
   A QA switch is a different account every time, so the "This device holds data from another account" card is only noise there. The switch and
   Return calls leave a time stamp in sessionStorage just before the reload; after it, on a QA service, the app wipes by itself. The decision is
   here so it can be tested; the component only reads the stamp and acts. Anything else (production, staging, a real second sign-in) is unchanged. */

export const SWITCH_MARK_KEY = 'qa-switched';
/** How long after a switch the stamp counts. */
export const SWITCH_MARK_MAX_MS = 2 * 60 * 1000;

/** The stamp to store, or the empty string. */
export const switchMark = (now: number): string => String(now);

/** The time a stored stamp holds, or null when it is missing or not a time. */
export function parseSwitchMark(raw: string | null | undefined): number | null {
  if (!raw || !/^\d{1,15}$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Whether a stored stamp is recent enough (and not from the future). */
export function markIsFresh(raw: string | null | undefined, now: number): boolean {
  const t = parseSwitchMark(raw);
  return t !== null && t <= now && now - t < SWITCH_MARK_MAX_MS;
}

export type AutoWipe = 'wipe' | 'wait' | 'drop';

/** What the card does: `wipe` now; `wait` for /api/me to say this is QA; `drop` the stamp and show the card as it always did. */
export function autoWipeDecision(i: { mark: string | null | undefined; now: number; qa: boolean; pausedBecause: string | null | undefined }): AutoWipe {
  if (!markIsFresh(i.mark, i.now)) return 'drop';
  if (i.pausedBecause !== 'account') return 'drop';
  return i.qa ? 'wipe' : 'wait';
}
