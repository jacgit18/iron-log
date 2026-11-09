import type { GroceryItem } from '../types.ts';
import { MAX_ALIASES, aliasKey, cleanAliases } from '../shared/grocery.js';
import type { Receipt } from '../shared/receipt.js';

/* ---------- Receipt names (brief receipt-rename-memory): the receipt texts a person renamed to an item, kept on the item as `aliases`. A scanned line whose text matches one
   is mapped to that item before any model guess. One text belongs to one item (the latest rename wins); an item may have several texts. Pure; the sheet and the store call it. ---------- */

export { MAX_ALIASES, aliasKey, cleanAliases };

/** The item that holds `text` as a receipt name (same after lowercasing, trimming and collapsing spaces), or undefined. Only the items given are searched, so a removed item's names are gone with it. */
export function findByAlias(items: readonly GroceryItem[], text: string): GroceryItem | undefined {
  const key = aliasKey(text);
  return key ? items.find(i => i.aliases?.some(a => aliasKey(a) === key)) : undefined;
}

/** The receipt with each priced line that has a saved name pointed at its item, whatever the model guessed; `remembered` says which lines (by index) and to which item. Returns the same receipt when nothing matched. */
export function applySavedNames(receipt: Receipt, items: readonly GroceryItem[]): { receipt: Receipt; remembered: Record<number, string> } {
  const remembered: Record<number, string> = {};
  const lines = receipt.lines.map((l, i) => {
    if (l.grossCents <= 0) return l; // a return or discount never matches
    const hit = findByAlias(items, l.text);
    if (!hit) return l;
    remembered[i] = hit.id;
    return l.matchId === hit.id ? l : { ...l, matchId: hit.id };
  });
  return Object.keys(remembered).length ? { receipt: { ...receipt, lines }, remembered } : { receipt, remembered };
}

/** One receipt text to save on one item. */
export interface AliasAdd { id: string; text: string }
/** `next`: the full receipt-name list of every item that changes (an empty list clears it); `moved`: texts taken from another item. */
export interface AliasPlan { next: Record<string, string[]>; moved: { text: string; from: string; to: string }[] }

/** What saving these texts changes. A later add of the same text wins; a text held by another item leaves it; an item keeps at most MAX_ALIASES, the oldest going first; an id that is not an item is skipped. */
export function planAliases(items: readonly GroceryItem[], adds: readonly AliasAdd[]): AliasPlan {
  const next: Record<string, string[]> = {};
  const moved: AliasPlan['moved'] = [];
  const get = (id: string) => next[id] ?? (next[id] = [...(items.find(i => i.id === id)?.aliases ?? [])]);
  const ids = new Set(items.map(i => i.id));
  for (const add of adds) {
    const text = cleanAliases([add.text])?.[0];
    if (!text || !ids.has(add.id)) continue;
    const key = aliasKey(text);
    for (const it of items) {
      if (it.id === add.id) continue;
      const list = get(it.id);
      const at = list.findIndex(a => aliasKey(a) === key);
      if (at >= 0) { list.splice(at, 1); moved.push({ text, from: it.id, to: add.id }); }
    }
    const mine = get(add.id);
    if (!mine.some(a => aliasKey(a) === key)) next[add.id] = [...mine, text].slice(-MAX_ALIASES); // a text it already has stays as it was written
  }
  const changed: Record<string, string[]> = {};
  for (const [id, list] of Object.entries(next)) {
    const was = items.find(i => i.id === id)?.aliases ?? [];
    if (list.length !== was.length || list.some((a, i) => a !== was[i])) changed[id] = list;
  }
  return { next: changed, moved: moved.filter(m => changed[m.from]) };
}

/** The item that holds `text` now when it is not `toId`: saving the text on `toId` moves it from there. */
export function movedFrom(items: readonly GroceryItem[], text: string, toId: string | null): GroceryItem | undefined {
  const hit = findByAlias(items, text);
  return hit && hit.id !== toId ? hit : undefined;
}

/** The list without `text` (matched the usual way). */
export const withoutAlias = (aliases: readonly string[], text: string): string[] => aliases.filter(a => aliasKey(a) !== aliasKey(text));

/** The words for the Applied notice: how many receipt names were saved. */
export const savedNamesText = (n: number): string => (n ? ` Remembered ${n} receipt ${n === 1 ? 'name' : 'names'}.` : '');

/* ---------- The sheet's name field ---------- */
type Named = Pick<GroceryItem, 'id' | 'n' | 'store'>;
/** What typing a name on a receipt row means: `same` (nothing changes), `match` (an item on the list or added from the sheet has that name: the row goes to it, no duplicate), `rename` (the row's own item, listed or added here, takes the name) or `new` (the row has no item: one is added with that name). */
export type NameResult = { kind: 'same' } | { kind: 'match'; id: string } | { kind: 'rename' } | { kind: 'new' };

export function resolveName(typed: string, current: Named | null, all: readonly Named[]): NameResult {
  const n = typed.replace(/\s+/g, ' ').trim().slice(0, 80);
  if (!n || (current && current.n.toLowerCase() === n.toLowerCase())) return { kind: 'same' };
  const same = all.filter(x => x.id !== current?.id && x.n.toLowerCase() === n.toLowerCase());
  const hit = same.find(x => x.store === current?.store) ?? same[0];
  if (hit) return { kind: 'match', id: hit.id };
  return current ? { kind: 'rename' } : { kind: 'new' };
}

/** One receipt row as the person left it: its text, the item it goes to, whether it is ticked, whether they changed its name or item (`touched`), and the Remember tick. */
export interface RowEdit { text: string; itemId: string | null; include: boolean; touched: boolean; remember: boolean }
/** The receipt names to save: each ticked, changed row whose item is used by the plan (`used`), with a sheet-only id swapped for the real one in `ids`. A row left alone is not remembered. */
export function aliasAddsFor(rows: readonly RowEdit[], used: ReadonlySet<string>, ids: Readonly<Record<string, string>>): AliasAdd[] {
  const out: AliasAdd[] = [];
  for (const r of rows) {
    if (!r.touched || !r.remember || !r.include || !r.itemId) continue;
    const id = ids[r.itemId] ?? r.itemId;
    if (used.has(id) || used.has(r.itemId)) out.push({ id, text: r.text });
  }
  return out;
}

/** What Apply needs from the store: the list as it is now and the item update. */
export interface NamesApi { items(): readonly GroceryItem[]; updateGroceryItem(id: string, patch: Partial<{ n: string; aliases: string[] }>): string | null }
/** `names` and `aliases`: each item changed, as it was before ([] is no receipt names), for Undo; `saved`: receipt names newly saved; `refused`: renames the list refused. */
export interface NamesWritten { names: Record<string, string>; aliases: Record<string, string[]>; saved: number; refused: string[] }

/** Renames the items the person renamed on the sheet, then saves the receipt names (`planAliases` on the list as it is after the renames). */
export function applyNames(api: NamesApi, renames: Readonly<Record<string, string>>, adds: readonly AliasAdd[]): NamesWritten {
  const out: NamesWritten = { names: {}, aliases: {}, saved: 0, refused: [] };
  for (const [id, n] of Object.entries(renames)) {
    const it = api.items().find(x => x.id === id);
    if (!it || it.n === n) continue;
    const err = api.updateGroceryItem(id, { n });
    if (err) out.refused.push(`${n} (${err})`); else out.names[id] = it.n;
  }
  const items = api.items();
  const plan = planAliases(items, adds);
  for (const [id, list] of Object.entries(plan.next)) {
    const was = items.find(x => x.id === id)?.aliases ?? [];
    const keys = new Set(was.map(aliasKey));
    out.saved += list.filter(a => !keys.has(aliasKey(a))).length;
    out.aliases[id] = [...was];
    api.updateGroceryItem(id, { aliases: list });
  }
  return out;
}
