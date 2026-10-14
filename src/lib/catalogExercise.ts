/* A catalog exercise joining your library (ADR 026): its name and equipment as a snapshot, plus its muscle tags. Shared by the
   library's Add (addCatalogExercise) and by the add sheets, which add a picked catalog exercise when they save (ADR 036). */
import type { CatalogItem, EquipmentId, ExerciseInfo, MuscleTags, ProgramCfg } from '../types.ts';
import { EQUIPMENT, exInfo, exerciseChoice, findExId, isCatalogId } from './data.js';

export const catalogName = (item: CatalogItem) => item.name.trim().replace(/\s+/g, ' ');

/** Why this catalog exercise cannot be used as picked, or null. One already in your library is fine: it is used as it is. */
/** `inUse`: exercise ids your programs, versions, experiments and logs use (exIdsInUse); a built-in among them that is not in cfg.ex still
 *  counts as one you have, so its name is not taken twice. */
export function catalogPickError(cfg: ProgramCfg, item: CatalogItem, inUse: string[] = []): string | null {
  const name = catalogName(item);
  if (!isCatalogId(item.id) || item.id.length > 100 || !name) return 'That catalog item can’t be added.';
  if (cfg.ex?.[item.id]) return null;
  const k = name.toLowerCase();
  if (findExId(cfg, name) || inUse.some(id => id !== item.id && exInfo(cfg, id).n.trim().replace(/\s+/g, ' ').toLowerCase() === k)) return `You already have an exercise called ${name}.`;
  return null;
}

/** What is written for it: `info` for cfg.ex (equipment from the sheet when it passes one, else the catalog's) and its tags, if any. */
export function catalogSnapshot(item: CatalogItem, extras: { nu?: string; ne?: EquipmentId | '' } = {}): { info: Partial<ExerciseInfo>; tags: MuscleTags | null } {
  const fromCat = item.data.eq && EQUIPMENT[item.data.eq] ? item.data.eq : undefined;
  const eq = extras.ne !== undefined ? extras.ne || undefined : fromCat;
  const t = item.data.muscles || {};
  const tags: MuscleTags = { ...(t.p?.length ? { p: t.p } : {}), ...(t.s?.length ? { s: t.s } : {}), ...(t.mob ? { mob: true as const } : {}) };
  return { info: { n: catalogName(item), ...(eq ? { eq } : {}), ...(extras.nu ? { url: extras.nu } : {}) }, tags: Object.keys(tags).length ? tags : null };
}

/** What an add sheet saves for the exercise field: the held catalog exercise while the name still matches it, else the typed name. */
export function pickedChoice(cfg: ProgramCfg, name: string, cat?: CatalogItem | null): { ex: string; nn: string; cat?: CatalogItem } {
  const k = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  return cat && k(cat.name) === k(name) ? { ex: cat.id, nn: '', cat } : exerciseChoice(cfg, name);
}
