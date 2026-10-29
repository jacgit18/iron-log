import type { Cfg } from '../types.ts';
import { allExIds, exInfo, isCatalogId, isOwnExercise } from './data.js';
import { eqName } from './equipment.js';
import { pickerKey, type MineOption } from './picker.js';

/* The exercises an item picker lists as yours (ADR 036): your library, plus exercises your programs, versions, experiments or logs still
   use that are not in it (`inUse`, a built-in an older program kept, ADR 024), each name once. A name a built-in also uses stays
   unmarked, so the built-in is never labelled Custom. */
export function exerciseOptions(cfg: Cfg, inUse: string[]): MineOption[] {
  const ids = [...new Set([...allExIds(cfg), ...inUse])];
  const builtin = new Set(ids.filter(x => !isOwnExercise(x) && !isCatalogId(x)).map(x => exInfo(cfg, x).n));
  const seen = new Set<string>();
  const mine: MineOption[] = [];
  for (const x of ids) {
    const info = exInfo(cfg, x); const k = pickerKey(info.n);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const badge = isCatalogId(x) ? 'Library' : isOwnExercise(x) && !builtin.has(info.n) ? 'Custom' : undefined;
    mine.push({ id: x, name: info.n, ...(isCatalogId(x) ? { catalogId: x } : {}), ...(badge ? { badge } : {}), ...(info.eq ? { meta: eqName(cfg, info.eq) } : {}) });
  }
  return mine;
}
