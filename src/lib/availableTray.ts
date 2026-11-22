import type { PlanSlot } from '../types.ts';
import { isEaten, type Resolved } from './dietPlan.js';
import type { HandyRow } from './repeats.js';
import type { BoardItem } from './weekBoard.js';

/* ---------- The board's two states (brief nutrition-planned-available-tray, ADR 146): Planned food sits on the plate, everything else waits in one closed Available tray per meal. Pure; the board draws it. ---------- */

/** A meal's items split into the plate and the tray. The plate holds what is planned (`p`), what is eaten (ticked, whether planned or not) and what is gone (so it can still be removed); every other item is Available. */
export function splitMeal(items: readonly BoardItem[], diet: readonly { id: string }[]): { plate: BoardItem[]; tray: BoardItem[] } {
  const plate: BoardItem[] = [], tray: BoardItem[] = [];
  for (const x of items) (x.r.item.p === true || x.r.gone || isEaten(x.r.item, diet) ? plate : tray).push(x);
  return { plate, tray };
}

/** One row of a meal's Available tray: a stored or shown item of the day, or a Keep handy food (`handy`, tagged in the row). */
export interface TrayRow { key: string; name: string; portion: number; r: Resolved; handy: boolean; rid?: string; item?: BoardItem }

/** A meal's tray rows, A to Z: its unplanned items and its Keep handy foods in one list. */
export function trayRows(items: readonly BoardItem[], handy: readonly HandyRow[]): TrayRow[] {
  const rows: TrayRow[] = [
    ...items.map(item => ({ key: `i${item.index}:${item.r.item.k}:${item.r.item.id}`, name: item.r.name, portion: item.r.portion, r: item.r, handy: false, item, ...(item.r.item.rp ? { rid: item.r.item.rp } : {}) })),
    ...handy.map(h => ({ key: `h${h.r.rid}`, name: h.res.name, portion: h.res.portion, r: h.res, handy: true, rid: h.r.rid })),
  ];
  return rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || (a.key < b.key ? -1 : 1));
}

/** The open or closed tray of each meal, remembered in this browser (brief nutrition-planned-available-tray: per meal, not per day, not synced). `raw` is what was stored; anything that is not an object of booleans reads as all closed. */
export type TrayOpen = Partial<Record<PlanSlot, true>>;
export const TRAY_OPEN_KEY = 'loadbearer.trayOpen';
export function parseTrayOpen(raw: string | null | undefined): TrayOpen {
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
    const out: TrayOpen = {};
    for (const s of ['breakfast', 'lunch', 'dinner', 'snack'] as const) if ((v as Record<string, unknown>)[s] === true) out[s] = true;
    return out;
  } catch { return {}; }
}
/** The stored text with one meal's tray opened or closed. */
export function trayOpenWith(raw: string | null | undefined, slot: PlanSlot, open: boolean): string {
  const cur = parseTrayOpen(raw);
  if (open) cur[slot] = true; else delete cur[slot];
  return JSON.stringify(cur);
}
