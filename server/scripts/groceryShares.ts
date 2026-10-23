import { sql, type Kysely } from 'kysely';
import type { DB } from '../db/types.ts';

// A read-only look at how one account's grocery splits are stored, for the owner to read when a split looks wrong on screen (production
// access rule: counts and shapes only, never an item or store name, a person's name, an id or an amount). `summarize` is pure; `readShares`
// reads inside one READ ONLY transaction. Run by hand: `npm run prod:db -- grocery-shares <user id>` (the id comes from `find-user`).

interface Share { with?: unknown; notMine?: unknown }
type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : null);

// The shape of one stored share, in words: none, "with 0", "with 2", plus "notMine"; a malformed one says so.
export function shapeOf(share: unknown, people: Set<string>): string {
  if (share === undefined || share === null) return 'none';
  const s = obj(share) as Share | null;
  if (!s || !Array.isArray(s.with)) return 'malformed';
  const unknown = s.with.filter(p => typeof p !== 'string' || (people.size > 0 && !people.has(p))).length;
  return `with ${s.with.length}${s.notMine ? ' + notMine' : ''}${unknown ? ` (${unknown} not a known person)` : ''}`;
}

const bump = (m: Record<string, number>, k: string) => { m[k] = (m[k] ?? 0) + 1; };

export interface SharesReport {
  groups: { count: number; peoplePerGroup: number[]; storesPerGroup: number[] };
  items: { count: number; byShare: Record<string, number>; storesNotInAnyGroup: number };
  months: Record<string, { lines: number; byShare: Record<string, number>; packShares: number; linesForMissingItems: number }>;
}

export function summarize(groupRows: unknown[], itemRows: unknown[], monthRows: { month: string; data: unknown }[]): SharesReport {
  const groups = groupRows.map(obj).filter((g): g is Obj => !!g);
  const people = new Set<string>();
  const grouped = new Set<string>();
  const report: SharesReport = { groups: { count: groups.length, peoplePerGroup: [], storesPerGroup: [] }, items: { count: 0, byShare: {}, storesNotInAnyGroup: 0 }, months: {} };
  for (const g of groups) {
    const ps = Array.isArray(g.people) ? g.people : []; const ss = Array.isArray(g.stores) ? g.stores : [];
    report.groups.peoplePerGroup.push(ps.length); report.groups.storesPerGroup.push(ss.length);
    ps.forEach(p => { const id = obj(p)?.id; if (typeof id === 'string') people.add(id); });
    ss.forEach(s => { if (typeof s === 'string') grouped.add(s); });
  }
  const items = itemRows.map(obj).filter((i): i is Obj => !!i);
  const ids = new Set(items.map(i => i.id).filter((x): x is string => typeof x === 'string'));
  report.items.count = items.length;
  items.forEach(i => bump(report.items.byShare, shapeOf(i.share, people)));
  report.items.storesNotInAnyGroup = new Set(items.map(i => i.store).filter((s): s is string => typeof s === 'string' && s !== '' && !grouped.has(s))).size;
  for (const row of monthRows) {
    const lines = obj(obj(row.data)?.lines) ?? {};
    const m = report.months[row.month] = { lines: 0, byShare: {}, packShares: 0, linesForMissingItems: 0 };
    for (const [id, raw] of Object.entries(lines)) {
      const l = obj(raw); if (!l) continue;
      m.lines++; bump(m.byShare, shapeOf(l.share, people));
      if (Array.isArray(l.packShares)) m.packShares += l.packShares.filter(Boolean).length;
      if (!ids.has(id)) m.linesForMissingItems++;
    }
  }
  return report;
}

export async function readShares(db: Kysely<DB>, userId: string): Promise<SharesReport> {
  return db.transaction().execute(async trx => {
    await sql`set transaction read only`.execute(trx);
    const rows = async (list: string) => (await sql<{ data: unknown }>`select data from list_items where user_id = ${userId} and list = ${list} and deleted_at is null`.execute(trx)).rows.map(r => r.data);
    const months = (await sql<{ month: string; data: unknown }>`select month, data from grocery_months where user_id = ${userId} and deleted_at is null order by month`.execute(trx)).rows;
    return summarize(await rows('grocery_group'), await rows('grocery_item'), months);
  });
}
