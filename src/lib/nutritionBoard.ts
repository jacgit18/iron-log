import type { Boost, DietEntry, PlanSlot, Recipe, SavedMeal, Supplements } from '../types.ts';
import { parseDate, weekStartOf, ymd } from '../shared/dates.js';
import { shiftDay, totalsFor, missingCarbsFat, fmtNum } from './dietLog.js';
import type { Plan } from './dietPlan.js';
import { portionTag } from './supplementPortion.js';
import { SLOTS, scheduleOf, slotTally } from './supplements.js';
import { boardDay, type BoardDay } from './weekBoard.js';
import { HOT_OZ, TRAIN_OZ_PER_30, fmtOz, goalFor, sumOz } from './water.js';

/* ---------- Nutrition as one week board (brief nutrition-board): which days a week holds, what a day's four meters show, which meal the add sheet starts on, what the Hydration and Supplements sections say. Pure; the board draws it. ---------- */

/** Weeks are Sunday to Saturday, like the Board's: 0 is the week today is in, -1 the week before it, 1 the week after. Days before today in this week stay on it. */
export type WeekOffset = -1 | 0 | 1;
export const WEEK_OFFSETS: readonly WeekOffset[] = [-1, 0, 1];
export const WEEK_NAME: Record<WeekOffset, string> = { '-1': 'Last week', '0': 'This week', '1': 'Next week' };

const days7 = (start: string): string[] => Array.from({ length: 7 }, (_, i) => shiftDay(start, i));
/** The Sunday of the week `today` is in. */
const sundayOf = (today: string): string => ymd(weekStartOf(parseDate(today)));

/** The seven days of a week on the board, Sunday first. The end of next week is at most 13 days ahead (today a Sunday), inside the plan window (MAX_PLAN_AHEAD). */
export const weekDays = (today: string, offset: WeekOffset): string[] => days7(shiftDay(sundayOf(today), offset * 7));

/** The week a day sits in. A day outside the board is clamped to the nearest end. */
export function weekOf(today: string, day: string): WeekOffset {
  const sun = sundayOf(today);
  return day < sun ? -1 : day < shiftDay(sun, 7) ? 0 : 1;
}

const firstDay = (today: string): string => shiftDay(sundayOf(today), -7);
const lastDay = (today: string): string => shiftDay(sundayOf(today), 13);

/** Whether a day is on the board at all: the first day of last week to the last day of next week. */
export const onBoard = (today: string, day: string): boolean => day >= firstDay(today) && day <= lastDay(today);

/** `day` moved by `delta` days and held inside the board (stepping stops at the ends). */
export function stepDay(today: string, day: string, delta: number): string {
  const lo = firstDay(today), hi = lastDay(today);
  const next = shiftDay(day, delta);
  return next < lo ? lo : next > hi ? hi : next;
}

/** How many day columns the board shows at a screen width (brief nutrition-header-sheet-wording): seven from 1440 px, three from 1000, two from 768, else one. */
export type DaysShown = 1 | 2 | 3 | 7;
export const daysShown = (width: number): DaysShown => (width >= 1440 ? 7 : width >= 1000 ? 3 : width >= 768 ? 2 : 1);

/** The `n` days of `week` to draw when `day` is the picked one: the picked day first and the days after it, held inside the week (a Saturday on a three-day board shows Thu, Fri, Sat). */
export function windowDays(week: readonly string[], day: string, n: number): string[] {
  const at = Math.max(0, week.indexOf(day));
  const start = Math.min(at, Math.max(0, week.length - n));
  return week.slice(start, start + n);
}

export type DayKind = 'past' | 'today' | 'future';
export const dayKind = (day: string, today: string): DayKind => (day < today ? 'past' : day === today ? 'today' : 'future');

/** "Sun 8": the short name a day goes by in a column header and on a tab. */
export const shortDay = (day: string): string => { const d = parseDate(day); return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`; };

/** "Sun, Nov 8": the name in a dropdown and in the toolbar's target. */
export const longDay = (day: string): string => parseDate(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

/** "Last week · Nov 1 to 7" (a week that crosses a month says both months). */
export function weekLabel(today: string, offset: WeekOffset): string {
  const d = weekDays(today, offset), a = parseDate(d[0]!), b = parseDate(d[6]!);
  const m = (x: Date) => x.toLocaleDateString('en-US', { month: 'short' });
  return `${WEEK_NAME[offset]} · ${m(a)} ${a.getDate()} to ${a.getMonth() === b.getMonth() ? '' : `${m(b)} `}${b.getDate()}`;
}

/** The day dropdown on a phone: three groups of seven, each day named, today marked. */
export function dayGroups(today: string): { offset: WeekOffset; label: string; days: { id: string; label: string }[] }[] {
  return WEEK_OFFSETS.map(offset => ({ offset, label: WEEK_NAME[offset], days: weekDays(today, offset).map(id => ({ id, label: `${shortDay(id)}${id === today ? ' · today' : ''}` })) }));
}

/** The toolbar's target: "Adding to Sun 8 · today". */
export const addingTo = (day: string, today: string): string => `Adding to ${shortDay(day)}${day === today ? ' · today' : ''}`;

/** Whether the day's food can be changed: today and the planned days; last week is read-only (supplements and water stay editable). */
export const foodEditable = (day: string, today: string): boolean => day >= today;

/** The meal the add sheet starts on, from the clock: before 10:30 Breakfast, to 14:30 Lunch, to 16:30 Snack, to 21:30 Dinner, else Snack. `minutes` is the minutes since midnight. */
export function mealByTime(minutes: number): PlanSlot {
  return minutes < 10 * 60 + 30 ? 'breakfast' : minutes < 14 * 60 + 30 ? 'lunch' : minutes < 16 * 60 + 30 ? 'snack' : minutes < 21 * 60 + 30 ? 'dinner' : 'snack';
}

/** The meal to start on: the last one picked when there is one, else the one for the time of day. */
export const startMeal = (last: PlanSlot | null | undefined, minutes: number): PlanSlot => last ?? mealByTime(minutes);

/** The add sheet's ways of adding. A future day plans (recipes and saved meals only); today logs what was eaten. */
export type AddFlow = 'quick' | 'barcode' | 'oneoff' | 'find' | 'meals' | 'recipes' | 'copy' | 'savemeal';
export const ADD_FLOWS: Record<AddFlow, { label: string; hint: string }> = {
  quick: { label: 'Quick add', hint: 'Foods you log most, and suggestions for now' },
  barcode: { label: 'Scan barcode', hint: 'Camera, then save the food to Recipes and log it' },
  oneoff: { label: 'One-off food', hint: 'Type a name, calories and protein' },
  find: { label: 'Find food', hint: 'Your past meals, your recipes and the food database; a label photo if a scan misses' },
  meals: { label: 'Saved meals', hint: 'Add a meal you saved' },
  recipes: { label: 'Recipes', hint: 'Add a recipe by portion' },
  copy: { label: 'Copy yesterday', hint: 'Tick what to copy from the day before' },
  savemeal: { label: 'Save as a meal in Recipes', hint: 'Turn what you ate into a meal in Recipes' },
};
const EAT_FLOWS: readonly AddFlow[] = ['quick', 'barcode', 'oneoff', 'find', 'meals', 'recipes', 'copy', 'savemeal'];
const PLAN_FLOWS: readonly AddFlow[] = ['meals', 'recipes'];
/** The shortcut buttons beside + Add food, so the toolbar keeps its shape on every editable day: today logs (scan, quick add, one-off), a day ahead plans (recipes, saved meals), last week has none. */
export const toolbarFlows = (day: string, today: string): readonly AddFlow[] => (day === today ? ['barcode', 'quick', 'oneoff'] : day > today ? ['recipes', 'meals'] : []);
export const addFlows = (day: string, today: string): readonly AddFlow[] => (day === today ? EAT_FLOWS : day > today ? PLAN_FLOWS : []);

/** The add sheet's menu in three labelled groups (brief nutrition-header-sheet-wording); a group with no way on that day is left out (a day ahead has no Fastest group). */
export const ADD_GROUPS: readonly { label: string; flows: readonly AddFlow[] }[] = [
  { label: 'Fastest', flows: ['quick', 'barcode', 'oneoff'] },
  { label: 'From what you have', flows: ['find', 'recipes'] },
  { label: 'Whole days and meals', flows: ['meals', 'copy', 'savemeal'] },
];
export const addGroups = (day: string, today: string): { label: string; flows: AddFlow[] }[] => {
  const on = addFlows(day, today);
  return ADD_GROUPS.map(g => ({ label: g.label, flows: g.flows.filter(f => on.includes(f)) })).filter(g => g.flows.length > 0);
};

/** Which way a day's numbers are counted: eaten food for last week and today, the plan for days ahead. */
export type MeterBasis = 'eaten' | 'planned';
export const basisOf = (day: string, today: string): MeterBasis => (day <= today ? 'eaten' : 'planned');

export interface Meter { key: 'kcal' | 'protein' | 'fat' | 'water'; label: string; unit: string; value: number; target: number | null; over: boolean; text: string; note?: string; hidden?: boolean }
/** The Supplements meter of a day: the share ticked, no target and never over. `pct` is 0 to 100; a day with nothing scheduled is an empty bar that says so. */
export interface SuppMeter { done: number; total: number; pct: number; text: string; label: string }
export interface DayView { day: string; kind: DayKind; basis: MeterBasis; meters: Meter[]; supps: SuppMeter; plan: BoardDay; eaten: DietEntry[]; fatNote: string | null }

const meterText = (value: number, target: number | null, unit: string): string => `${fmtNum(value)}${target ? ` / ${fmtNum(target)}` : ''} ${unit}`;
const meter = (key: Meter['key'], label: string, unit: string, value: number, target: number | null): Meter => ({ key, label, unit, value, target, over: !!target && value > target, text: meterText(value, target, unit) });

/** What a day's targets are. */
export interface DayTargets { kcal: number | null; protein: number | null; fat: number | null }

/** A day as the board draws it: four meters (calories, protein, fat from the diet log for last week and today, from the plan for days ahead; water from the water log against that day's goal), the plan's meals, and the eaten food. */
export function dayView(day: string, today: string, a: { plan: Plan; recipes: Recipe[]; meals: SavedMeal[]; diet: DietEntry[]; supp: Supplements; body: { d: string; w: number }[]; targets: DayTargets }): DayView {
  const basis = basisOf(day, today);
  const plan = boardDay(a.plan, day, a.recipes, a.meals, a.targets.kcal);
  const eaten = a.diet.filter(e => e.d === day);
  const tot = totalsFor(a.diet, day);
  const water = goalFor(a.supp, a.body, day);
  const planned = basis === 'planned';
  const fatHidden = planned && plan.fatState === 'hidden';
  const meters: Meter[] = [
    meter('kcal', 'Calories', 'kcal', planned ? plan.kcal : tot.kcal, a.targets.kcal),
    meter('protein', 'Protein', 'g', planned ? plan.protein : tot.protein, a.targets.protein),
    meter('fat', 'Fat', 'g', planned ? plan.fat : tot.fat, a.targets.fat),
    meter('water', 'Water', 'oz', sumOz(a.supp.water[day]), water.oz),
  ];
  const fatMeter = meters[2]!;
  if (planned && plan.fatState === 'partial') fatMeter.note = `Fat: ${plan.fatFoods.known} of ${plan.fatFoods.all} foods have it.`;
  if (fatHidden) { fatMeter.note = 'Add fat to your foods to see fat here.'; fatMeter.hidden = true; }
  const fatNote = !planned && eaten.length > 0 && missingCarbsFat(a.diet, day) ? 'Carbs and fat count only what you enter.' : null;
  return { day, kind: dayKind(day, today), basis, meters, supps: suppMeter(a.supp, day), plan, eaten, fatNote };
}

/** The Supplements meter (drawn before Water): "2 of 4 taken" fills 50%; nothing scheduled says "None scheduled" with an empty bar. Counts ticks on any day. */
export function suppMeter(supp: Supplements, day: string): SuppMeter {
  const { done, total } = supplementDay(supp, day);
  const text = total ? `${done} of ${total} taken` : 'None scheduled';
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0, text, label: `Supplements taken: ${text}` };
}

/** The label of a meter for a screen reader: the numbers in words, and whether they are eaten or planned. */
export const meterLabel = (m: Meter, basis: MeterBasis, kind: DayKind): string =>
  `${m.label} ${m.key === 'water' ? 'drunk' : basis === 'eaten' ? (kind === 'past' ? 'eaten' : 'eaten so far') : 'planned'}: ${m.text}${m.over ? `, ${fmtNum(Math.round((m.value - (m.target ?? 0)) * 10) / 10)} ${m.unit} over` : ''}${m.target ? '' : ', no target set'}`;

export interface HydrationView { goal: number; drunk: number; left: number; status: string; tags: string[]; lines: { label: string; oz: number }[]; future: boolean }

/** The Hydration section of a day: the goal, what is left, the reason tags (hot day, training) and the goal broken down line by line. A day that has not come yet with nothing logged says "Goal n oz". */
export function hydrationView(day: string, today: string, supp: Supplements, body: { d: string; w: number }[]): HydrationView {
  const g = goalFor(supp, body, day);
  const drunk = sumOz(supp.water[day]);
  const left = Math.max(0, Math.round((g.oz - drunk) * 10) / 10);
  const future = day > today;
  const status = future && drunk === 0 ? `Goal ${fmtOz(g.oz)} oz` : left > 0 ? `${fmtOz(left)} oz to go` : 'Goal met';
  const b: Boost | undefined = supp.boost?.[day];
  const tags = [...(g.extra.hot ? [`Hot day +${fmtOz(g.extra.hot)}`] : []), ...(g.extra.train ? [`Training ${b?.mins ?? 0} min +${fmtOz(g.extra.train)}`] : [])];
  const base = g.source === 'weight' ? `Base, half of ${fmtOz(g.lb ?? 0)} lb` : g.source === 'default' ? 'Base (no body weight logged)' : 'Base, set by you';
  const lines = [{ label: base, oz: g.baseOz }, ...(g.extra.hot ? [{ label: 'Hot day', oz: g.extra.hot }] : []), ...(g.extra.train ? [{ label: `Training ${b?.mins ?? 0} min`, oz: g.extra.train }] : [])];
  return { goal: g.oz, drunk, left, status, tags, lines, future };
}

export { HOT_OZ, TRAIN_OZ_PER_30 };

export interface SupplementDay { done: number; total: number; text: string; slots: { slot: string; label: string; items: { id: string; n: string; dose: string; taken: boolean; /** "1 capsule" when taken at other than one serving (brief supplement-portions); empty otherwise. */ tag: string }[] }[] }

/** A day's supplements as Morning, Noon and Night with each tick, and "x of n taken". Ticking works on any day. */
export function supplementDay(supp: Supplements, day: string): SupplementDay {
  const by = scheduleOf(supp.items);
  const slots = SLOTS.map(([slot, label]) => ({ slot, label, items: (by[slot] ?? []).map(i => ({ id: i.id, n: i.n, dose: i.dose ?? '', taken: !!supp.taken[day]?.[i.id], tag: portionTag(i) })) }));
  const total = slots.reduce((a, s) => a + s.items.length, 0);
  const done = slots.reduce((a, s) => a + slotTally(supp.items, supp.taken, day, s.slot).done, 0);
  return { done, total, text: total ? `${done} of ${total} taken` : 'Nothing scheduled', slots };
}
