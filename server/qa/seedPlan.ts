import type { Persona } from './personas.ts';

/* ---------- What the seed script writes for one persona, as plain rows ----------
   Pure: no database, no clock (today is passed in), so a test can check every persona's counts and the script only has to insert.
   The same persona and the same day always give the same rows (a seeded generator), so a re-run puts back exactly what was there. */

export interface SeedLog { clientId: string; exerciseId: string; d: string; wk: string; phase: string; weightLb: number; setsCount: number; reps: number }
export interface SeedBody { wk: string; d: string; weightLb: number }
export interface SeedGrocery { clientId: string; position: number; data: { id: string; n: string; store: string; qty: number; cents: number | null; every: boolean; out: boolean } }
export interface PersonaRows {
  logs: SeedLog[];
  body: SeedBody[];
  groceryItems: SeedGrocery[];
  groceryStores: { clientId: string; position: number; data: { id: string; n: string } }[];
  programs: boolean;
  erased: boolean;
}

export const STORES = ['Costco', 'Trader Joe\'s', 'Farmers market', 'Corner shop'];
const FOODS = ['Eggs', 'Rice', 'Oats', 'Chicken thighs', 'Spinach', 'Bananas', 'Greek yogurt', 'Olive oil', 'Lentils', 'Salmon', 'Almonds', 'Sweet potatoes', 'Broccoli', 'Tuna', 'Milk', 'Peanut butter', 'Berries', 'Beef mince', 'Tofu', 'Cheese'];
const PHASES = ['strength', 'iso', 'hyp'];

/** mulberry32: a small seeded generator. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = (s: string) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
/** The Monday of the week holding `d` (weeks start Monday in the app's `wk`). */
const monday = (d: Date) => addDays(d, -((d.getUTCDay() + 6) % 7));

export function buildPersonaRows(persona: Persona, exerciseIds: readonly string[], today: Date): PersonaRows {
  const rand = rng(hash(persona.id));
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const spec = persona.data;
  const logs: SeedLog[] = [];
  if (spec.logEntries > 0 && exerciseIds.length) {
    // Spread the entries over the days, a few exercises on a training day, rest days in between; stop at exactly the target.
    const trainingDays: number[] = [];
    for (let back = 0; back < spec.logDays; back++) if (rand() < 0.62) trainingDays.push(back);
    if (!trainingDays.length) trainingDays.push(0);
    let i = 0;
    while (logs.length < spec.logEntries) {
      const back = trainingDays[i % trainingDays.length]!;
      const d = addDays(t, -back);
      const ex = exerciseIds[Math.floor(rand() * exerciseIds.length)]!;
      logs.push({
        clientId: `qa-${persona.id}-${String(logs.length + 1).padStart(5, '0')}`,
        exerciseId: ex, d: iso(d), wk: iso(monday(d)), phase: PHASES[Math.floor(rand() * PHASES.length)]!,
        weightLb: 10 + Math.round(rand() * 40) * 5, setsCount: 2 + Math.floor(rand() * 4), reps: 6 + Math.floor(rand() * 10),
      });
      i++;
    }
  }
  const body: SeedBody[] = [];
  for (let w = 0; w < spec.bodyWeeks; w++) {
    const d = addDays(monday(t), -7 * w);
    body.push({ wk: iso(d), d: iso(d), weightLb: Math.round((180 - w * 0.05 + (rand() - 0.5) * 3) * 10) / 10 });
  }
  const groceryStores = spec.groceryItems > 0 ? STORES.map((n, position) => ({ clientId: n, position, data: { id: n, n } })) : [];
  const groceryItems: SeedGrocery[] = [];
  for (let n = 0; n < spec.groceryItems; n++) {
    const id = `qa-${persona.id}-g${String(n + 1).padStart(3, '0')}`;
    const every = rand() < 0.7;
    groceryItems.push({ clientId: id, position: n, data: { id, n: `${FOODS[n % FOODS.length]!} ${Math.floor(n / FOODS.length) + 1}`, store: STORES[n % STORES.length]!, qty: 1 + Math.floor(rand() * 3), cents: rand() < 0.75 ? 100 + Math.floor(rand() * 1500) : null, every, out: !every && rand() < 0.4 } });
  }
  return { logs, body, groceryItems, groceryStores, programs: spec.programs, erased: spec.erased === true };
}
