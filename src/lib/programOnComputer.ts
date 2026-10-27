import { LS } from './storage.js';

// The "Program on a computer" tip (brief: briefs/program-on-computer): building a program is easier on a bigger screen, so a phone or tablet
// is told once and can send itself the link. The card shows on the Program tab until dismissed; the Settings row is always there on touch
// screens. Nothing here mentions a price or a plan (the Android app carries none, ADR 065 and ADR 078): the shared text is the address only.
const KEY = 'hideprogramcomputer';

export const CARD_TEXT = 'Planning a program is easier on a computer. Open loadbearer.app there, then use your phone in the gym.';
export const ROW_TITLE = 'Build programs on a computer';
export const ROW_TEXT = 'A bigger screen makes planning easier. Open loadbearer.app there, then train with your phone.';
export const SEND_LABEL = 'Send me the link';
export const COPIED_LABEL = 'Link copied';
export const COPY_FAILED = 'Copy failed. Open loadbearer.app on a computer.';
export const SHARE_TEXT = 'Build your program on a computer:';

export const programCardDismissed = (): boolean => LS.get(KEY) === 1;
export const dismissProgramCard = () => { LS.set(KEY, 1); };

export interface CardInputs { touch: boolean; programTab: boolean; waitingForSignIn: boolean; installHintShowing: boolean; dismissed: boolean }

/** Pure rule: a touch screen, on the Program tab, once the person is in, never beside the install hint, until dismissed. */
export function showProgramCard({ touch, programTab, waitingForSignIn, installHintShowing, dismissed }: CardInputs): boolean {
  return touch && programTab && !waitingForSignIn && !installHintShowing && !dismissed;
}

/** The Settings row: every touch screen, whatever was dismissed. A computer never sees it. */
export const showProgramRow = (touch: boolean): boolean => touch;

/** What the share sheet receives: this site's address (so staging shares staging) and a short line. No price or plan word. */
export const sharePayload = (origin: string) => ({ title: 'Loadbearer', text: SHARE_TEXT, url: `${origin}/` });

export type SendOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';
export interface SendEnv { share?: (data: ShareData) => Promise<void>; writeText?: (text: string) => Promise<void> }

/** Opens the phone's share sheet. With no sheet (or one that fails), copies the address. Closing the sheet is not an error. */
export async function sendLink(origin: string, env: SendEnv): Promise<SendOutcome> {
  const payload = sharePayload(origin);
  if (env.share) {
    try { await env.share(payload); return 'shared'; }
    catch (err) { if (err instanceof Error && err.name === 'AbortError') return 'cancelled'; }
  }
  if (!env.writeText) return 'failed';
  try { await env.writeText(payload.url); return 'copied'; } catch { return 'failed'; }
}

/** The wording must never carry money talk: checked in the unit test over every string the tip shows or shares. */
export const MONEY_WORDS = /\b(price|prices|pricing|plan|plans|subscribe|subscription|upgrade|paid|pay|plus|pro|free|trial|billing)\b|\$\d/i;
export const ALL_TEXT = [CARD_TEXT, ROW_TITLE, ROW_TEXT, SEND_LABEL, COPIED_LABEL, COPY_FAILED, SHARE_TEXT, 'Not now'];
