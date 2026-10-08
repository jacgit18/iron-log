import { DEFAULT_GROUP, normStretchExperimentItem, normStretchItem } from '../shared/listItems.js';
import { STRETCH_DAYS, normStretchWeek } from '../shared/stretchWeek.js';
import type { Stretch, StretchExperiment, StretchTier, StretchWeek } from '../types.ts';

export { DEFAULT_GROUP, STRETCH_DAYS, normStretchWeek };

/* ---------- Stretches: the routine, the library and the week's check-offs ----------
   items: [{id, n, url, note, group, tier}]. tier 'primary' is on the board every day, 'secondary' sits under
   "Once in a while", '' is only kept in the library. Order in the array is the order shown.
   A stretch week is {done: {"<day 0-6>:<id>": true}, skipped: {"<day 0-6>": true}, extra: [{id, day, n, url, note}]}: the week's check-offs,
   plus stretches added to one day from the Experiment list. */

const S = (id: string, n: string, group: string, tier: StretchTier, extra: Partial<Stretch> = {}): Stretch => ({ id, n, group, tier, ...extra });
const yt = (id: string) => `https://youtu.be/${id}`;
export const DEFAULT_STRETCHES: Stretch[] = [
  S('scarecrow', 'Scarecrow', 'Bands', 'primary', { url: yt('qzNQ3_TQHDs') }),
  S('v-raise', 'V Raise', 'Bands', 'primary', { url: yt('5WBdE0TSoUQ'), note: 'Cross' }),
  S('spinal-twist', 'Supine Spinal Twist', 'Back', 'primary', { url: 'https://www.youtube.com/watch?v=mNdJti7ZwKI' }),
  S('reverse-plank', 'Reverse Plank', 'Back', 'primary', { url: yt('mwaEHn2mZsE') }),
  S('crab-position', 'Crab Position', 'Back', 'primary', { url: yt('2AWWezRz3cI'), note: 'Flow into it from the reverse plank' }),
  S('hip-switch-90', '90/90 Hip Switch', 'Back', 'primary', { url: 'https://www.youtube.com/watch?v=qq_Z7sAmVrA' }),
  S('sky-squat-reach', 'Sky Squat Reach', 'Squatting', 'primary', { url: 'https://www.youtube.com/watch?v=Zv1wILGzeec', note: 'Or Deep Squat Band Single Arm Reach, or BJJ Hip Switch to Extension' }),
  S('bjj-roll-up', 'BJJ Roll Up', 'Squatting', 'primary'),
  S('duck-walk', 'Duck Walk', 'Squatting', 'primary'),
  S('wall-angels', 'Wall Angels', 'Standing', 'primary', { url: yt('ywYi4rBhRBQ') }),
  S('shoulder-arm-circles', 'Shoulder and Arm Circles', 'Standing', 'primary'),
  S('up-kicks-leg-swings', 'Up Kicks or Leg Swings', 'Standing', 'primary'),
  S('superman-roll', 'Grounded Superman Roll', 'On stomach', 'secondary'),
  S('scorpion', 'Scorpion Stretch', 'On stomach', 'secondary', { url: yt('uNDfgnWN2G0'), note: 'Be on the side of your face' }),
  S('prayer-stretch', 'Elevated Prayer Stretch', 'Squatting', 'secondary', { url: yt('c7cnNg6rBes'), note: 'On a bench or cube' }),
  S('twisted-arms', 'Twisted Arms', 'Standing', 'secondary'),
  S('twisted-leg-reach', 'Twisted Leg Reach', 'Standing', 'secondary'),
  S('deep-squat-band-reach', 'Deep Squat Band Single Arm Reach', 'Squatting', '', { url: yt('qQCc_zulZpg') }),
  S('bjj-hip-switch-ext', 'BJJ Hip Switch to Extension', 'Squatting', ''),
];

export const TIERS: [StretchTier, string][] = [['primary', 'Every day'], ['secondary', 'Once in a while'], ['', 'Library only']];
export const tierLabel = (t: string) => (TIERS.find(([k]) => k === t) || TIERS[2])[1];


// Whatever was saved, cleaned: bad rows dropped, ids unique. A doc that was never saved is the default routine.
export function normStretches(d: any): { items: Stretch[]; experiments: StretchExperiment[] } {
  if (!d || typeof d !== 'object' || !Array.isArray(d.items)) return { items: structuredClone(DEFAULT_STRETCHES), experiments: normExperiments(d && d.experiments) };
  const seen = new Set<string>(); const items: Stretch[] = [];
  d.items.forEach((x: any) => {
    const item = normStretchItem(x);
    if (!item || seen.has(item.id)) return;
    seen.add(item.id); items.push(item);
  });
  return { items, experiments: normExperiments(d.experiments) };
}
export function normExperiments(list: unknown): StretchExperiment[] {
  const seen = new Set<string>(); const out: StretchExperiment[] = [];
  (Array.isArray(list) ? list : []).forEach(x => {
    const item = normStretchExperimentItem(x);
    if (!item || seen.has(item.id)) return;
    seen.add(item.id); out.push(item);
  });
  return out;
}
export const stretchWeekEmpty = (w: StretchWeek) => !Object.keys(w.done).length && !Object.keys(w.skipped).length && !w.extra.length;

// Items of one tier, grouped by their group name in order of first appearance.
export function groupsOf(items: Stretch[], tier: StretchTier) {
  const out: { name: string; items: Stretch[] }[] = [];
  items.filter(i => i.tier === tier).forEach(i => {
    let g = out.find(x => x.name === i.group);
    if (!g) { g = { name: i.group, items: [] }; out.push(g); }
    g.items.push(i);
  });
  return out;
}
export const doneKey = (day: number, id: string) => `${day}:${id}`;
export const isStretchDone = (week: StretchWeek, day: number, id: string) => !!week.done[doneKey(day, id)];
export const isDaySkipped = (week: StretchWeek, day: number) => !!week.skipped[day];
export const extrasOn = (week: StretchWeek, day: number) => week.extra.filter(x => x.day === day);

// A day counts its every-day stretches and what was added to it; "once in a while" ones don't count toward done.
export function dayTally(items: Stretch[], week: StretchWeek, day: number) {
  if (isDaySkipped(week, day)) return { done: 0, total: 0, full: false, skipped: true };
  const ids = [...items.filter(i => i.tier === 'primary').map(i => i.id), ...extrasOn(week, day).map(x => x.id)];
  const done = ids.filter(id => isStretchDone(week, day, id)).length;
  return { done, total: ids.length, full: ids.length > 0 && done === ids.length };
}
export const weekDaysDone = (items: Stretch[], week: StretchWeek) => Array.from({ length: STRETCH_DAYS }, (_, d) => d).filter(d => dayTally(items, week, d).full).length;
export const weekDaysCounted = (week: StretchWeek) => STRETCH_DAYS - Object.keys(week.skipped).length; // a skipped day isn't counted for or against the week

// Drop check-offs for a stretch that was deleted from the library.
export function withoutStretch(week: StretchWeek, id: string): StretchWeek {
  const done: Record<string, true> = {}; Object.keys(week.done).forEach(k => { if (k.slice(2) !== id) done[k] = true; });
  return { ...week, done };
}

export function newStretchId(items: Stretch[], name: unknown) {
  const base = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'stretch';
  const taken = new Set(items.map(i => i.id)); let id = base, n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  return id;
}
