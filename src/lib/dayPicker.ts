import { MAX_PLAN_AHEAD } from '../shared/diet.js';
import { parseDate } from '../shared/dates.js';
import type { DietEntry } from '../types.ts';
import { ateDayError, oldestDay, shiftDay } from './dietLog.js';
import { dayLabel, shortDay, sundayOf } from './dayNames.js';

/* ---------- The multi-day picker's rules (brief nutrition-multi-day-picker): which days a food can go to and why not, the quick picks, the week strip and the sentence after. Pure; the picker draws it. ---------- */

/** What is being copied or moved: an eaten entry (its day and recipe link) or a planned item on `day`. */
export type PickerSource = { kind: 'eaten'; entry: Pick<DietEntry, 'd' | 'from'> } | { kind: 'plan'; day: string };

export interface PickerDay { id: string; label: string; /** Why the day is greyed, or null when it can be ticked. */ reason: string | null }
export interface QuickPick { id: 'tomorrow' | 'next7' | 'weekdays'; label: string; days: string[] }
export interface SkippedDay { day: string; /** Short reason ("full", "already there"). */ reason: string }

export const ONE_OFF_REASON = 'One-off foods can’t be planned.';
export const OWN_DAY_REASON = 'That is its own day.';
export const PAST_ONLY_REASON = 'Only food you ate can move or copy.';
export const WINDOW_REASON = 'You can plan the next 52 weeks.';
export const PLAN_START_REASON = 'You can plan today and the next 52 weeks.';

/** How far the quick picks reach: the next two weeks, however far the plan window goes. */
export const QUICK_PICK_DAYS = 14;

/** The last day a plan can reach. */
export const lastPlanDay = (today: string): string => shiftDay(today, MAX_PLAN_AHEAD);

/** Why `day` can't be ticked for this source, or null. The source's own day is never a target; eaten food goes to today and earlier (still kept) or, with a recipe link, to a day ahead as a plan card; a planned item goes to today and the days ahead. */
export function dayReason(source: PickerSource, day: string, today: string): string | null {
  if (source.kind === 'plan') {
    if (day === source.day) return OWN_DAY_REASON;
    if (day > lastPlanDay(today)) return WINDOW_REASON;
    return day < today ? PLAN_START_REASON : null;
  }
  const { entry } = source;
  if (entry.d > today) return PAST_ONLY_REASON;
  if (day === entry.d) return OWN_DAY_REASON;
  if (day > today) {
    if (day > lastPlanDay(today)) return WINDOW_REASON;
    return entry.from ? null : ONE_OFF_REASON;
  }
  return ateDayError(day, today);
}

/** Every day the picker reaches, oldest kept day to today + 364, each with its label and reason. Plans start today, so a planned source starts its list there. */
export function pickerDays(source: PickerSource, today: string): PickerDay[] {
  const from = source.kind === 'plan' ? today : oldestDay(today), to = lastPlanDay(today);
  const out: PickerDay[] = [];
  for (let d = from; d <= to; d = shiftDay(d, 1)) out.push({ id: d, label: dayLabel(d, today), reason: dayReason(source, d, today) });
  return out;
}

/** The first and last week (Sundays) the strip can show. */
export function pickerWeekRange(source: PickerSource, today: string): { first: string; last: string } {
  return { first: sundayOf(source.kind === 'plan' ? today : oldestDay(today)), last: sundayOf(lastPlanDay(today)) };
}

/** The strip's week starting at `weekStart` (a Sunday), seven days; a day outside the picker's reach is greyed with why. `prev` and `next` are the weeks the arrows go to, or null at the ends. */
export function pickerWeek(source: PickerSource, today: string, weekStart: string): { start: string; days: PickerDay[]; prev: string | null; next: string | null } {
  const { first, last } = pickerWeekRange(source, today);
  const start = weekStart < first ? first : weekStart > last ? last : sundayOf(weekStart);
  const days = Array.from({ length: 7 }, (_, i) => {
    const id = shiftDay(start, i);
    return { id, label: dayLabel(id, today), reason: dayReason(source, id, today) };
  });
  return { start, days, prev: start > first ? shiftDay(start, -7) : null, next: start < last ? shiftDay(start, 7) : null };
}

/** The quick picks: Tomorrow, Next 7 days, Weekdays for the next two weeks. Each day set is clipped to the days the source can go to (so a one-off food gets none); a pick left with no days is omitted. */
export function quickPicks(source: PickerSource, today: string): QuickPick[] {
  const ahead = Array.from({ length: QUICK_PICK_DAYS }, (_, i) => shiftDay(today, i + 1)); // tomorrow to the end of the quick picks' two weeks (not the whole plan window)
  const ok = (days: string[]) => days.filter(d => dayReason(source, d, today) === null);
  const weekday = (d: string) => { const n = parseDate(d).getDay(); return n >= 1 && n <= 5; };
  const picks: QuickPick[] = [
    { id: 'tomorrow', label: 'Tomorrow', days: ok(ahead.slice(0, 1)) },
    { id: 'next7', label: 'Next 7 days', days: ok(ahead.slice(0, 7)) },
    { id: 'weekdays', label: 'Weekdays, 2 weeks', days: ok(ahead.filter(weekday)) },
  ];
  return picks.filter(p => p.days.length > 0);
}

/** The one sentence after a copy or move: "Copied to 5 days. Skipped Tue 18: full." `verb` is Copied or Moved. */
export function resultText(verb: 'Copied' | 'Moved', done: readonly string[], skipped: readonly SkippedDay[]): string {
  const skip = skipped.length ? ` Skipped ${skipped.map(s => `${shortDay(s.day)}: ${s.reason}`).join(', ')}.` : '';
  if (!done.length) return `Nothing ${verb === 'Copied' ? 'copied' : 'moved'}.${skip}`;
  const where = done.length === 1 ? shortDay(done[0]!) : `${done.length} days`;
  return `${verb} to ${where}.${skip}`;
}

/** The button text: "Copy to 5 days", "Copy to Sun 15" for one, "Pick a day" for none. */
export function goLabel(verb: 'Copy' | 'Move', days: readonly string[]): string {
  if (!days.length) return 'Pick a day';
  return `${verb} to ${days.length === 1 ? shortDay(days[0]!) : `${days.length} days`}`;
}

/** A planned card's Move button: the label and whether it can be pressed. A day (and a changed meal) moves it there, a changed meal alone moves it within its day, neither has nothing to do. `meal` is the chip picked, `own` the card's own meal. */
export function moveButton(days: readonly string[], meal: string | undefined, own: string | undefined, mealLabel: (m: string) => string): { label: string; enabled: boolean } {
  const changed = !!meal && meal !== own;
  if (days.length) return { label: `${goLabel('Move', days)}${changed ? `, ${mealLabel(meal!)}` : ''}`, enabled: true };
  return changed ? { label: `Move to ${mealLabel(meal!)}`, enabled: true } : { label: 'Pick a day', enabled: false };
}

/** "This day on": `day` to the last plannable day, one entry per day. Empty when `day` is outside today..today + 364. */
export function onwardDays(day: string, today: string): string[] {
  const out: string[] = [], last = lastPlanDay(today);
  for (let d = day < today ? today : day; d <= last; d = shiftDay(d, 1)) out.push(d);
  return out;
}

/** The sentence after planning one food on several days: "Planned Soup for Lunch on 5 days. Skipped Tue 18: full." */
export function plannedText(name: string, meal: string, done: readonly string[], skipped: readonly SkippedDay[]): string {
  const skip = skipped.length ? ` Skipped ${skipped.map(s => `${shortDay(s.day)}: ${s.reason}`).join(', ')}.` : '';
  if (!done.length) return `Nothing planned.${skip}`;
  return `Planned ${name} for ${meal} on ${done.length === 1 ? shortDay(done[0]!) : `${done.length} days`}.${skip}`;
}
