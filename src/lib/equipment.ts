import type { Cfg, EquipmentId } from '../types.ts';
import { EQUIPMENT, EQ_KEYS } from './data.js';
import { nameCmp } from './sort.js';

/* ---------- Equipment: the built-in list plus what the user added ----------
   cfg.equipment[id] = name, with id `x:` and a slug of the name. Menus show the built-ins and the added ones together,
   alphabetical by name with Other last. An added item can be removed only while no exercise uses it. */
export const EQ_NAME_MAX = 30;
export const EQ_CUSTOM_MAX = 30;
export const EQ_ID_RE = /^x:[a-z0-9-]{1,40}$/;

export const eqName = (cfg: Pick<Cfg, 'equipment'>, id: string | null | undefined): string =>
  (id && (Object.hasOwn(EQUIPMENT, id) ? EQUIPMENT[id as keyof typeof EQUIPMENT] : Object.hasOwn(cfg.equipment || {}, id) ? cfg.equipment![id] : '')) || '';

/** Every choice for a menu: built-ins and added items by name, Other last. */
export function eqOptions(cfg: Pick<Cfg, 'equipment'>): { id: EquipmentId; name: string }[] {
  const all = [...EQ_KEYS.filter(k => k !== 'other').map(k => ({ id: k as EquipmentId, name: EQUIPMENT[k] })),
    ...Object.entries(cfg.equipment || {}).map(([id, name]) => ({ id: id as EquipmentId, name }))];
  all.sort(nameCmp(e => e.name, e => e.id));
  return [...all, { id: 'other', name: EQUIPMENT.other }];
}

const key = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
/** The id of the equipment with this name, built-in or added (any capitalization), or null. */
export const findEq = (cfg: Pick<Cfg, 'equipment'>, name: string): EquipmentId | null =>
  eqOptions(cfg).find(o => key(o.name) === key(name))?.id ?? null;

/** A new id for `name`: `x:` and its slug, numbered if taken. */
export function newEqId(cfg: Pick<Cfg, 'equipment'>, name: string): EquipmentId {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'item';
  let id = `x:${base}`; let n = 2;
  while (Object.hasOwn(cfg.equipment || {}, id)) id = `x:${base}-${n++}`;
  return id as EquipmentId;
}

/** Why `name` cannot be added, or null. */
export function eqNameError(cfg: Pick<Cfg, 'equipment'>, name: string): string | null {
  const n = name.trim().replace(/\s+/g, ' ');
  if (!n) return 'Type the name of the equipment';
  if (n.length > EQ_NAME_MAX) return `Keep the name to ${EQ_NAME_MAX} characters`;
  if (findEq(cfg, n)) return `${n} is already in the list`;
  if (Object.keys(cfg.equipment || {}).length >= EQ_CUSTOM_MAX) return `You can add up to ${EQ_CUSTOM_MAX} kinds of equipment`;
  return null;
}
