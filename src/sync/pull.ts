import type { MirrorStore } from './mirrorStore.js';
import type { FailureClass, PullOutcome, Transport } from './transport.js';
import type { ServerRow, SyncTable } from './types.js';

/* ---------- Pulling the server's changes ----------
   Asks for every row changed after the cursor, page by page, until the server says there is no more. Each page is
   applied and saved together with its cursor, so a pull that stops halfway (offline, a deploy) resumes where it
   stopped. Pulling is safe to repeat: rows are applied by version, so the same page twice changes nothing. */

const KNOWN: readonly SyncTable[] = ['log_entries', 'body_entries', 'weeks', 'stretch_weeks', 'supplement_days', 'programs', 'config', 'library_items', 'list_items'];
const PAGE_LIMIT = 500;
const MAX_PAGES = 1000;

export type PullResult =
  | { ok: true; pages: number; rows: number; paths: string[] }
  | { ok: false; class: Exclude<FailureClass, 'refused' | 'conflict'>; message: string; retryAfterMs: number | null; pages: number; rows: number; paths: string[] };

export async function pullAll(transport: Pick<Transport, 'pull'>, store: MirrorStore, limit = PAGE_LIMIT): Promise<PullResult> {
  const paths = new Set<string>();
  let pages = 0;
  let rows = 0;
  const stop = (cls: 'network' | 'server' | 'auth' | 'outdated', message: string, retryAfterMs: number | null): PullResult =>
    ({ ok: false, class: cls, message, retryAfterMs, pages, rows, paths: [...paths] });

  while (pages < MAX_PAGES) {
    const out: PullOutcome = await transport.pull(store.cursor(), limit);
    if (!out.ok) return stop(out.class, out.message, out.retryAfterMs);

    const byTable: Partial<Record<SyncTable, ServerRow[]>> = {};
    for (const row of out.rows) {
      // A table this version of the app does not know: the server is newer. Stop without moving the cursor, so nothing is skipped.
      if (!KNOWN.includes(row.table)) return stop('outdated', `the server sent a table this version does not know: ${String(row.table)}`, null);
      (byTable[row.table] ||= []).push(row);
    }
    if (!/^\d+$/.test(out.cursor)) return stop('server', 'the server sent a cursor that is not a number', null);
    // The cursor only moves forward. A page that claims more but does not advance would loop forever.
    if (out.more && BigInt(out.cursor) <= BigInt(store.cursor())) return stop('server', 'the server did not advance the cursor', null);
    if (BigInt(out.cursor) < BigInt(store.cursor())) return stop('server', 'the server sent a cursor behind ours', null);

    const applied = store.applyPage(byTable, out.cursor);
    applied.paths.forEach(p => paths.add(p));
    pages++;
    rows += out.rows.length;
    if (!out.more) return { ok: true, pages, rows, paths: [...paths] };
  }
  return stop('server', 'too many pages in one pull', null);
}
