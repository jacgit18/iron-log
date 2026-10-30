import type { DietEntry, Recipe } from '../types.ts';
import { MAX_DIET_PER_DAY, RETAIN_DAYS, cleanGrams, cleanKcal, cleanProtein } from '../shared/diet.js';
import { parseDate, ymd } from '../shared/dates.js';

/* ---------- Food log helpers (ADR 086): what a day adds up to, what is offered again, what is kept. Pure; the store and the view call these. ---------- */

export const entriesOn = (entries: DietEntry[], day: string): DietEntry[] => entries.filter(e => e.d === day);

export interface Totals { kcal: number; protein: number; carbs: number; fat: number; count: number }
const sum1 = (n: number) => Math.round(n * 10) / 10;
export function totalsFor(entries: DietEntry[], day: string): Totals {
  const on = entriesOn(entries, day);
  return { kcal: on.reduce((a, e) => a + e.kcal, 0), protein: sum1(on.reduce((a, e) => a + e.p, 0)), carbs: sum1(on.reduce((a, e) => a + (e.c ?? 0), 0)), fat: sum1(on.reduce((a, e) => a + (e.f ?? 0), 0)), count: on.length };
}

/** Whether any entry of the day has no carbs or fat entered (so those two totals are only what was entered). */
export const missingCarbsFat = (entries: DietEntry[], day: string): boolean => entriesOn(entries, day).some(e => e.c === undefined || e.f === undefined);

/** Whether another entry fits on that day. */
export const roomOn = (entries: DietEntry[], day: string): boolean => entriesOn(entries, day).length < MAX_DIET_PER_DAY;

/** A day moved by whole days ("2026-10-29", -1 is "2026-10-28"). */
export function shiftDay(day: string, delta: number): string {
  const d = parseDate(day); d.setDate(d.getDate() + delta); return ymd(d);
}

/** The oldest day that is kept: RETAIN_DAYS before `today`. */
export const oldestDay = (today: string): string => shiftDay(today, -RETAIN_DAYS);

/** The entries kept: those within RETAIN_DAYS of `today`. */
export function pruned(entries: DietEntry[], today: string): DietEntry[] {
  const cutoff = oldestDay(today);
  return entries.filter(e => e.d >= cutoff);
}

/** The foods typed by hand (not from a recipe), newest first, one per name, for one-tap adding again. */
export function recentQuick(entries: DietEntry[], limit = 6): { n: string; kcal: number; p: number; c?: number; f?: number }[] {
  const seen = new Set<string>(), out: { n: string; kcal: number; p: number; c?: number; f?: number }[] = [];
  for (let i = entries.length - 1; i >= 0 && out.length < limit; i--) {
    const e = entries[i]!;
    const key = e.n.toLowerCase();
    if (e.from || seen.has(key)) continue;
    seen.add(key); out.push({ n: e.n, kcal: e.kcal, p: e.p, ...(e.c !== undefined ? { c: e.c } : {}), ...(e.f !== undefined ? { f: e.f } : {}) });
  }
  return out;
}

/** Whether a recipe has the numbers needed to log it. */
export const hasMacros = (r: Pick<Recipe, 'kcal' | 'p'>): boolean => r.kcal !== undefined && r.p !== undefined;

/** The numbers for eating `servings` of a recipe (a snapshot: later edits to the recipe never change them), or null without calories and protein or out of range. Carbs and fat come along when the recipe has them. */
export function servingNumbers(r: Pick<Recipe, 'kcal' | 'p' | 'c' | 'f'>, servings: number): { kcal: number; p: number; c?: number; f?: number } | null {
  if (!hasMacros(r) || !(servings > 0)) return null;
  const kcal = cleanKcal(r.kcal! * servings), p = cleanProtein(r.p! * servings);
  if (kcal === null || p === null) return null;
  const c = r.c === undefined ? null : cleanGrams(r.c * servings), f = r.f === undefined ? null : cleanGrams(r.f * servings);
  return { kcal, p, ...(c !== null ? { c } : {}), ...(f !== null ? { f } : {}) };
}

/** One entry in words: "520 kcal · 42 g protein", with " · 60 g carbs" and " · 12 g fat" when they were entered. */
export const entryText = (e: Pick<DietEntry, 'kcal' | 'p' | 'c' | 'f'>): string =>
  [`${fmtNum(e.kcal)} kcal`, `${fmtNum(e.p)} g protein`, ...(e.c !== undefined ? [`${fmtNum(e.c)} g carbs`] : []), ...(e.f !== undefined ? [`${fmtNum(e.f)} g fat`] : [])].join(' · ');

/** How full a bar is, 0 to 100 (the bar stops at full; the text says how far over). */
export const barPercent = (have: number, target: number | null): number => (target && target > 0 ? Math.max(0, Math.min(100, Math.round((have / target) * 100))) : 0);

/** "1,850 of 2,775" style numbers. */
export const fmtNum = (n: number): string => n.toLocaleString('en-US');

/** A meter's words: "1,850 of 2,775 kcal", with ", 225 over" past the target, or just "1,850 kcal" with no target. */
export function meterText(have: number, target: number | null, unit: string): string {
  if (!target) return `${fmtNum(have)} ${unit}`;
  const over = have - target;
  return `${fmtNum(have)} of ${fmtNum(target)} ${unit}${over > 0 ? `, ${fmtNum(Math.round(over * 10) / 10)} over` : ''}`;
}
