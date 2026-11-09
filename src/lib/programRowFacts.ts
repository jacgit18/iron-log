// The Program editor's plain-language text (brief: briefs/program-tab-clarity): what one exercise row says about itself, what a section label means,
// the one sentence under "Day at a glance", and the line in the header card. Only what a card already holds is used (`rx`, `w`, `bw`, the phase, the tier);
// a field a card does not have is left out, never guessed.
import type { PhaseKey, ProgramItem, ProgramSlot } from '../types.ts';
import type { DaySummary } from './daySummary.js';
import { PHASES } from './data.js';
import { exerciseCount } from './exerciseCount.js';

export interface ItemFacts { facts: string; phase: string | null; phaseKey: PhaseKey | null }

/** "3 × 10 · 45 lb", "Bodyweight", "" : sets and reps, then the load, leaving out whichever the card has not got. */
export function itemFacts(it: Pick<ProgramItem, 'ph' | 'w' | 'bw' | 'rx'>): ItemFacts {
  const load = it.w != null ? `${it.w} lb` : it.bw ? 'Bodyweight' : '';
  return { facts: [it.rx || '', load].filter(Boolean).join(' · '), phase: it.ph ? PHASES[it.ph].label : null, phaseKey: it.ph ?? null };
}

/** The role pill: Primary reads "Main lift", an Optional section reads "Optional", any other tier shows as typed. Empty when the card has neither. */
export function rolePill(sl: Pick<ProgramSlot, 'tier' | 'sec'>): string {
  if (sl.tier === 'Primary') return 'Main lift';
  if (sl.tier) return sl.tier;
  return sl.sec === 'Optional' ? 'Optional' : '';
}

const SECTION_NOTES: Record<string, string> = {
  optional: 'Extra work, only if you have time',
  regular: 'The core of the day',
  supersets: 'Two exercises done back to back',
};
/** A plain explanation for the section names the app itself uses. A name the person typed has none (names are their data): it is shown as typed. */
export const sectionNote = (name: string | undefined): string => SECTION_NOTES[(name || '').trim().toLowerCase()] ?? '';

/** The line under the Superset label of a boxed group. */
export const SUPERSET_NOTE = 'Do one set of each, then repeat';

/** The cards of one run of consecutive superset cards share one box: the index ranges [start, end] of every run. */
export function supersetRuns(slots: Pick<ProgramSlot, 'type'>[]): [number, number][] {
  const runs: [number, number][] = [];
  slots.forEach((s, i) => {
    if (s.type !== 'superset') return;
    const last = runs[runs.length - 1];
    if (last && last[1] === i - 1) last[1] = i; else runs.push([i, i]);
  });
  return runs;
}

const list = (names: string[]) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
const MOST = 0.5; // a phase that is at least this share of a day's exercises is "mostly" that phase

/** "Mostly strength. Works forearms & grip, inner thigh and chest." — from the same numbers as the breakdown, so the two never disagree. */
export function summarySentence(sm: Pick<DaySummary, 'exercises' | 'phases' | 'muscles'>): string {
  if (sm.exercises === 0) return 'No exercises on this day yet.';
  const total = sm.phases.reduce((n, p) => n + p.count, 0);
  const top = [...sm.phases].sort((a, b) => b.count - a.count)[0];
  const parts: string[] = [];
  if (top && total && top.count / total >= MOST) parts.push(`Mostly ${PHASES[top.key].label.toLowerCase()}.`);
  else if (sm.phases.length > 1) parts.push(`A mix of ${list(sm.phases.map(p => PHASES[p.key].label.toLowerCase()))}.`);
  if (sm.muscles.length) parts.push(`Works ${list(sm.muscles.slice(0, 3).map(m => m.name.toLowerCase()))}.`);
  return parts.join(' ');
}

/** "66 exercises across 7 days" (the header card's second line). */
export function programHeadline(days: { slots: ProgramSlot[] }[]): string {
  const n = days.reduce((a, d) => a + exerciseCount(d.slots), 0);
  return `${n} ${n === 1 ? 'exercise' : 'exercises'} across ${days.length} days`;
}
