import type { DietEntry, PlanSlot } from '../types.ts';

/* ---------- Logging into a meal (button review N8, stage 2). Every way of logging a food ends in the store's `addDietEntry`, taken as a port; wrapping that one port puts the meal on each entry the way writes it, so no flow needs its own copy of the rule. Pure. ---------- */

/** `ports` with its `addDietEntry` stamping `s` (the meal pressed) on every entry it is given; with no meal, `ports` itself. The pressed meal wins over any `s` an entry already carries. */
export function stampMeal<T extends { addDietEntry(d: Omit<DietEntry, 'id'>): R }, R>(ports: T, slot: PlanSlot | undefined): T {
  if (!slot) return ports;
  return { ...ports, addDietEntry: (d: Omit<DietEntry, 'id'>) => ports.addDietEntry({ ...d, s: slot }) };
}
