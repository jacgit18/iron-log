/* ---------- The one macro line (brief redesign-shared-macro-line-and-pill): "410 kcal · P 22 · C 58 · F 9 g". Pure; every screen that words a food's numbers calls this. ---------- */

/** "1,850 of 2,775" style numbers. */
export const fmtNum = (n: number): string => n.toLocaleString('en-US');

/** The numbers a food may carry, per whatever amount the caller means (a serving, an entry, 100 g). */
export interface MacroParts { kcal?: number; p?: number; c?: number; f?: number }

const has = (v: number | undefined): v is number => typeof v === 'number' && Number.isFinite(v);
const tenth = (v: number): number => Math.round(v * 10) / 10;

/** A food's numbers in one line: "410 kcal · P 22 · C 58 · F 9 g". Only the parts it has ("410 kcal", "P 22 g"); calories as a whole number,
 * grams to one decimal; "" when it has none, so the caller keeps its own fallback text. A value that is not a finite number counts as missing. */
export function macroLine(m: MacroParts): string {
  const grams = [has(m.p) ? `P ${fmtNum(tenth(m.p))}` : '', has(m.c) ? `C ${fmtNum(tenth(m.c))}` : '', has(m.f) ? `F ${fmtNum(tenth(m.f))}` : ''].filter(Boolean);
  if (grams.length) grams[grams.length - 1] += ' g';
  return [has(m.kcal) ? `${fmtNum(Math.round(m.kcal))} kcal` : '', ...grams].filter(Boolean).join(' · ');
}

/** The same numbers in words for a screen reader: "410 calories, 22 grams protein, 58 grams carbs, 9 grams fat" (the short line would be read as the letters P, C and F). Same rules as `macroLine`: only the parts it has, "" when none. */
export function macroWords(m: MacroParts): string {
  const g = (v: number | undefined, name: string): string => (has(v) ? `${fmtNum(tenth(v))} ${tenth(v) === 1 ? 'gram' : 'grams'} ${name}` : '');
  const kcal = has(m.kcal) ? `${fmtNum(Math.round(m.kcal))} ${Math.round(m.kcal) === 1 ? 'calorie' : 'calories'}` : '';
  return [kcal, g(m.p, 'protein'), g(m.c, 'carbs'), g(m.f, 'fat')].filter(Boolean).join(', ');
}
