import type { PhaseKey, Program, ProgramDay, ProgramItem } from '../types.ts';
import { PHASES, PH_KEYS } from './data.js';

// The Program tab's Compare panel: two programs side by side, day by day. Read-only, so everything here is a pure function of two programs.
// Exercises are matched by their id (`ex`, the exercise's identity; the editor shows its name from the catalog) within the same day (trimmed, case-insensitive); an exercise that moved to another day is Only in on both days.
export type CompareStatus = 'same' | 'chg' | 'ph' | 'onlyA' | 'onlyB';
export type StatusFilter = 'all' | 'diff' | CompareStatus;
export type PhaseFilter = PhaseKey | 'none' | null;

export interface CompareRow {
  ex: string;
  status: CompareStatus;
  left: ProgramItem | null;
  right: ProgramItem | null;
  /** Both sides have the exercise but train it in a different phase (also true on a Changed row). */
  phDiff: boolean;
}

const keyOf = (ex: string) => ex.trim().toLowerCase();
// A superset's items are separate exercises; an either/or card's options are too.
const itemsOf = (day: ProgramDay | undefined): ProgramItem[] => (day?.slots ?? []).flatMap(s => s.items);
const sameLoad = (a: ProgramItem, b: ProgramItem) => (a.w ?? null) === (b.w ?? null) && !!a.bw === !!b.bw && (a.rx ?? '') === (b.rx ?? '');

export function compareDay(a: ProgramDay | undefined, b: ProgramDay | undefined): CompareRow[] {
  const right = new Map<string, ProgramItem[]>();
  for (const it of itemsOf(b)) { const k = keyOf(it.ex); right.set(k, [...(right.get(k) ?? []), it]); }
  const rows: CompareRow[] = [];
  for (const l of itemsOf(a)) {
    const r = right.get(keyOf(l.ex))?.shift() ?? null; // a name repeated in a day pairs in order
    if (!r) { rows.push({ ex: l.ex, status: 'onlyA', left: l, right: null, phDiff: false }); continue; }
    const phDiff = (l.ph ?? null) !== (r.ph ?? null);
    rows.push({ ex: l.ex, status: !sameLoad(l, r) ? 'chg' : phDiff ? 'ph' : 'same', left: l, right: r, phDiff });
  }
  for (const rest of right.values()) for (const r of rest) rows.push({ ex: r.ex, status: 'onlyB', left: null, right: r, phDiff: false });
  return rows;
}

/** One list of rows per day, as many days as the longer program has. */
export function compareProgram(a: Program, b: Program): CompareRow[][] {
  const n = Math.max(a.days.length, b.days.length);
  return Array.from({ length: n }, (_, i) => compareDay(a.days[i], b.days[i]));
}

export const phaseOf = (r: CompareRow, side: 'left' | 'right'): PhaseKey | null => (r[side]?.ph ?? null);

export function filterRows(rows: CompareRow[], status: StatusFilter, phase: PhaseFilter): CompareRow[] {
  return rows.filter(r => {
    if (status === 'diff' ? r.status === 'same' : status !== 'all' && r.status !== status) return false;
    if (phase === null) return true;
    const want = phase === 'none' ? null : phase;
    return phaseOf(r, 'left') === want || phaseOf(r, 'right') === want;
  });
}

export type CompareCounts = Record<CompareStatus, number> & { diff: number; all: number };

/** Counts for the summary bar and the chips: always of the unfiltered rows, so a filter never changes them. */
export function countRows(rows: CompareRow[]): CompareCounts {
  const c: CompareCounts = { same: 0, chg: 0, ph: 0, onlyA: 0, onlyB: 0, diff: 0, all: rows.length };
  for (const r of rows) { c[r.status]++; if (r.status !== 'same') c.diff++; }
  return c;
}

/** Exercises per phase across a whole program, for the phase-mix bar (an exercise with no phase counts under `none`). */
export function phaseMix(p: Program): Record<PhaseKey | 'none', number> {
  const m = Object.fromEntries([...PH_KEYS, 'none'].map(k => [k, 0])) as Record<PhaseKey | 'none', number>;
  for (const d of p.days) for (const it of itemsOf(d)) m[it.ph ?? 'none']++;
  return m;
}

const loadOf = (it: ProgramItem) => [it.w != null ? `${it.w} lb` : (it.bw ? 'bodyweight' : ''), it.rx || ''].filter(Boolean).join(' · ');

/** The editor's own row text for one exercise: "Hypertrophy · 85 lb · 3×8". */
export const itemLine = (it: ProgramItem): string => [it.ph ? PHASES[it.ph].label : 'No phase', loadOf(it)].filter(Boolean).join(' · ');

/** Weight and sets alone ("85 lb · 3×8"; empty when the exercise has neither). */
export const loadLine = loadOf;

/** Which parts of a row that has both sides differ, so the screen can mark them on both sides (nothing differs on a row that is only on one side). */
export function diffParts(r: CompareRow): { load: boolean; phase: boolean } {
  if (!r.left || !r.right) return { load: false, phase: false };
  return { load: !sameLoad(r.left, r.right), phase: r.phDiff };
}
