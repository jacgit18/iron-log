import { currentLayout, DAYS, doneUnitsOf, isSkipped, tally, unitsOf } from './logic.js';
import { cancelPush, schedulePush } from './pushClient.js';
import type { FlatSlot, Week } from '../types.js';

// The "day not finished" nudge (ADR 044): 30 minutes after the last tick of a day that has been started and whose tick box is not yet ticked, a push says
// how much is left. Each tick moves it 30 minutes on; finishing the day takes it back. The phone decides all of this (the server holds
// no workout data); the push itself is lib/pushClient.ts.
export const NUDGE_DELAY_MS = 30 * 60_000;
const QUIET_AFTER = 21 * 60 + 30; // minutes since midnight: nothing after 9:30 pm (owner, 2026-10-14)
const QUIET_BEFORE = 6 * 60;      // ...or before 6 am, so a late session does not buzz in the middle of the night

/** Whether a push at `at` would land in the quiet hours, by this device's clock. */
export function inQuietHours(at: number): boolean {
  const d = new Date(at);
  const m = d.getHours() * 60 + d.getMinutes();
  return m > QUIET_AFTER || m < QUIET_BEFORE;
}

export type NudgeAction = { do: 'schedule'; left: number } | { do: 'cancel' } | null;

// "Finished" is the day's own tick box (every card ticked or skipped, Home and Optional ones too), not the looser "workout is done" that raises a
// back-to-back suggestion: leaving the sled or a home card unticked is exactly the "not finished" the nudge is for.
const openCards = (cards: FlatSlot[], week: Week) => cards.filter(s => !isSkipped(s, week) && doneUnitsOf(s, week) < unitsOf(s, week)).length;
const isFull = (cards: FlatSlot[], week: Week) => tally(cards, week).full;

/** What a change to the check-offs means for the nudge, or null when it means nothing. */
export function nudgeAction(before: Week, after: Week, slots: FlatSlot[]): NudgeAction {
  const a = currentLayout(after, slots), b = currentLayout(before, slots);
  const ticked = DAYS.filter(c => tally(a[c], after).done > tally(b[c], before).done);
  const reopened = DAYS.filter(c => isFull(b[c], before) && !isFull(a[c], after) && tally(a[c], after).done > 0);
  const started = [...ticked, ...reopened].find(c => !isFull(a[c], after));
  if (started != null) return { do: 'schedule', left: openCards(a[started], after) };
  if (ticked.length || DAYS.some(c => isFull(a[c], after) && !isFull(b[c], before))) return { do: 'cancel' }; // the day got finished
  return null;
}

const body = (left: number) => `Day not finished: ${left} ${left === 1 ? 'exercise' : 'exercises'} left.`;

/** Called after a change to the check-offs. */
export function trackNudge(before: Week, after: Week, slots: FlatSlot[], now = Date.now()): void {
  const action = nudgeAction(before, after, slots);
  if (!action) return;
  if (action.do === 'cancel') return cancelPush('day-nudge');
  const at = now + NUDGE_DELAY_MS;
  if (inQuietHours(at)) return cancelPush('day-nudge'); // a nudge from an earlier tick must not fire at night either
  schedulePush('day-nudge', String(now), at, body(action.left));
}
