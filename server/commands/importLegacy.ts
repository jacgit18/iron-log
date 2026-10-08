import { sql, type Kysely, type Transaction } from 'kysely';
import { inUserTransaction } from '../auth.ts';
import type { DB } from '../db/types.ts';
import { logBodyWeight } from './bodyWeight.ts';
import { saveConfig, saveLibraryItem, saveListItem, saveProgram, saveStretchWeek, saveWeek } from './documents.ts';
import { logSession } from './logSession.ts';
import { lockUser, parseEnvelope, refuse } from './support.ts';
import { saveSupplementDay } from './supplementDays.ts';
import { tickCard } from './tickCard.ts';

// Phase E, decision 10 (stack-walkthrough.md): the one-time upload of what a phone held before it had an account.
// One command, one transaction, and only for an account with no rows at all, so a second run, or a second device that
// still holds old data, can never stamp older edits over real ones (FM-11).
//
// The phone sends the creates it would have sent one by one (the same command names, ids and inputs), and this runs them
// through the same handlers, so every rule that applies to a normal write applies here. Every one must be a create: a
// command that is refused, or that finds its id already used (two legacy entries that hashed to the same id), stops the
// whole import and rolls everything back. Nothing half-imported is ever left behind.

type Handler = (trx: Transaction<DB>, userId: string, body: unknown, clientVersion: string | null) => Promise<{ status: number; body: unknown }>;

const HANDLERS: Record<string, { run: Handler; table: string }> = {
  'log-session': { run: logSession, table: 'log_entries' },
  'tick-card': { run: tickCard, table: 'log_entries' },
  'log-body-weight': { run: logBodyWeight, table: 'body_entries' },
  'save-week': { run: saveWeek, table: 'weeks' },
  'save-stretch-week': { run: saveStretchWeek, table: 'stretch_weeks' },
  'save-supplement-day': { run: saveSupplementDay, table: 'supplement_days' },
  'save-program': { run: saveProgram, table: 'programs' },
  'save-config': { run: saveConfig, table: 'config' },
  'save-library-item': { run: saveLibraryItem, table: 'library_items' },
  'save-list-item': { run: saveListItem, table: 'list_items' },
};
const TABLES = [...new Set(Object.values(HANDLERS).map(h => h.table))];

/** The most commands one import may carry: years of daily logging fit with room to spare, and a mistake cannot become a flood. */
export const MAX_IMPORT_COMMANDS = 20_000;

export type ImportResult =
  | { status: 201; body: { imported: Record<string, number>; total: number } }
  | { status: 409 | 422; body: { refused: string; at?: number; command?: string } };

class Abort extends Error {
  constructor(readonly at: number, readonly command: string, readonly reason: string) { super(reason); }
}

interface Item { name: string; clientId: string; input: unknown }
function items(input: unknown): Item[] | null {
  const list = (input as { commands?: unknown } | null)?.commands;
  if (!Array.isArray(list) || list.length === 0 || list.length > MAX_IMPORT_COMMANDS) return null;
  const out: Item[] = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') return null;
    const { name, clientId, input: body } = c as Record<string, unknown>;
    if (typeof name !== 'string' || !Object.hasOwn(HANDLERS, name) || typeof clientId !== 'string') return null;
    out.push({ name, clientId, input: body });
  }
  return out;
}

async function isEmpty(trx: Transaction<DB>, userId: string): Promise<boolean> {
  for (const table of TABLES) {
    // Deleted rows count too: an account that has ever held data is not empty.
    const { rows } = await sql`select 1 from ${sql.table(table)} where user_id = ${userId} limit 1`.execute(trx);
    if (rows.length) return false;
  }
  return true;
}

export async function importLegacy(db: Kysely<DB>, userId: string, body: unknown, clientVersion: string | null): Promise<ImportResult> {
  const env = parseEnvelope(body);
  const list = env ? items(env.input) : null;
  if (!env || !list) {
    await inUserTransaction(db, userId, trx => refuse(trx, userId, 'import-legacy', { input: null }, 'bad-envelope', clientVersion));
    return { status: 422, body: { refused: 'bad-envelope' } };
  }
  try {
    return await inUserTransaction(db, userId, async (trx): Promise<ImportResult> => {
      await lockUser(trx, userId);
      if (!(await isEmpty(trx, userId))) throw new Abort(-1, 'import-legacy', 'account-not-empty');
      const imported: Record<string, number> = {};
      for (const [at, item] of list.entries()) {
        const out = await HANDLERS[item.name]!.run(trx, userId, { clientId: item.clientId, baseVersion: null, input: item.input }, clientVersion);
        if (out.status !== 201) {
          const reason = (out.body as { refused?: string }).refused ?? (out.status === 200 ? 'duplicate-id' : `status-${out.status}`);
          throw new Abort(at, item.name, reason);
        }
        imported[item.name] = (imported[item.name] ?? 0) + 1;
      }
      return { status: 201, body: { imported, total: list.length } };
    });
  } catch (err) {
    if (!(err instanceof Abort)) throw err;
    // The transaction rolled back, so the refusal is written on its own. Only where it stopped is kept, never the data.
    const reason = err.at < 0 ? err.reason : `${err.command}: ${err.reason}`;
    await inUserTransaction(db, userId, trx => refuse(trx, userId, 'import-legacy', { clientId: env.clientId, input: { at: err.at, command: err.command } }, reason, clientVersion));
    return { status: err.reason === 'account-not-empty' ? 409 : 422, body: { refused: err.reason, ...(err.at >= 0 ? { at: err.at, command: err.command } : {}) } };
  }
}
