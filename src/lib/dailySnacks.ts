import { MAX_DAILY_SNACKS } from '../shared/diet.js';
import type { DailySnack, DietCfg, PlanItem } from '../types.ts';
import { inWindow, type Plan } from './dietPlan.js';

/* ---------- Daily snacks (brief daily-snacks): a saved list that shows in Snack on every day of the plan window. Pure; the store writes it and the board draws it. ---------- */

const NO_SKIPS: Readonly<Record<string, string[]>> = {};

/** The listed snacks that show on `day`: not skipped that day, and not already on the day as a real item in any meal (a snack you ticked, moved or planned yourself replaces its listed copy). */
export function snacksShownOn(day: string, plan: Plan, snacks: readonly DailySnack[] | undefined, skips: Readonly<Record<string, string[]>> = NO_SKIPS): DailySnack[] {
  if (!snacks?.length) return [];
  const real = plan[day] ?? [], skipped = skips[day] ?? [];
  return snacks.filter(s => !skipped.includes(s.id) && !real.some(i => i.k === 'r' && i.id === s.id));
}

/** The plan as the board shows it: each day in the window gets its shown daily snacks after its real items, in Snack, marked `v` (never stored). The same object when there is nothing to add, so memos hold. */
export function effectivePlan(diet: DietCfg | undefined, days: readonly string[], today: string): Plan {
  const plan: Plan = diet?.plan ?? {};
  if (!diet?.snacks?.length) return plan;
  let out: Plan | null = null;
  for (const day of days) {
    if (!inWindow(day, today)) continue;
    const shown = snacksShownOn(day, plan, diet.snacks, diet.snackSkips);
    if (!shown.length) continue;
    const added: PlanItem[] = shown.map(s => ({ k: 'r', id: s.id, ...(s.x ? { x: s.x } : {}), s: 'snack', v: true }));
    (out ??= { ...plan })[day] = [...(plan[day] ?? []), ...added];
  }
  return out ?? plan;
}

type Edit = { list: DailySnack[]; error: null } | { list: null; error: string };
const fail = (error: string): Edit => ({ list: null, error });

/** `list` with the recipe `id` added (portion 1). An error text when it is already there or the list is full. */
export function addSnack(list: readonly DailySnack[], id: string): Edit {
  if (list.some(s => s.id === id)) return fail('That is already a daily snack.');
  if (list.length >= MAX_DAILY_SNACKS) return fail(`You can keep ${MAX_DAILY_SNACKS} daily snacks.`);
  return { list: [...list, { id }], error: null };
}

/** `list` without the snack `id`. */
export const removeSnack = (list: readonly DailySnack[], id: string): DailySnack[] => list.filter(s => s.id !== id);

/** `list` with the snack `id` at `portion` (half steps, 0.5 to 10; 1 is stored as no `x`). Unchanged for a bad portion. */
export function setSnackPortion(list: readonly DailySnack[], id: string, portion: number): DailySnack[] {
  if (!(portion >= 0.5 && portion <= 10) || portion * 2 !== Math.round(portion * 2)) return [...list];
  return list.map(s => (s.id === id ? { id, ...(portion === 1 ? {} : { x: portion }) } : s));
}

/** The skips with the snack `id` skipped on `day` only. */
export function skipSnack(skips: Readonly<Record<string, string[]>> | undefined, day: string, id: string): Record<string, string[]> {
  const cur = skips?.[day] ?? [];
  return cur.includes(id) ? { ...skips } : { ...skips, [day]: [...cur, id] };
}

/** The portion a listed snack is shown at. */
export const snackPortion = (s: DailySnack): number => s.x ?? 1;
