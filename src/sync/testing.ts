import type { CommandOutcome, Envelope, PullOutcome } from './transport.js';
import type { CommandName, DesiredRow, Mirror, MirrorRow } from './types.js';
import { idOfRow } from './rows.js';

/* Helpers for the sync tests: build a mirror the way the server would have filled it. */

let seq = 0;
export const asRow = (row: DesiredRow, over: { version?: number; deleted?: boolean; seq?: string } = {}): MirrorRow =>
  ({ ...row, version: over.version ?? 1, deleted: over.deleted ?? false, seq: over.seq ?? String(++seq) }) as MirrorRow;

export const mirrorOf = (rows: DesiredRow[], over: { version?: number } = {}): Map<string, MirrorRow> => new Map(rows.map(r => [idOfRow(r), asRow(r, over)]));

export const withRow = (mirror: Mirror, row: MirrorRow): Map<string, MirrorRow> => new Map(mirror).set(idOfRow(row), row);

/* A storage object that behaves like the browser's: values survive being written and read back as JSON. */
export function memoryStorage(refuseWrites = false) {
  const data = new Map<string, string>();
  return {
    data,
    refuse: refuseWrites,
    get(key: string): unknown { const v = data.get(key); return v === undefined ? null : JSON.parse(v); },
    set(key: string, value: unknown): boolean { if (this.refuse) return false; data.set(key, JSON.stringify(value)); return true; },
    remove(key: string) { data.delete(key); },
  };
}

/* A row as the API sends it, with the given fields on top of the usual ones. */
export const serverRow = (fields: object, over: { version?: number; seq?: string; deleted_at?: string | null } = {}) =>
  ({ id: '1', user_id: '1', version: 1, seq: '1', deleted_at: null, client_updated_at: null, schema_version: 1, ...fields, ...over }) as never;

export const logServerRow = (clientId: string, over: { version?: number; seq?: string; deleted_at?: string | null } = {}, fields: object = {}) =>
  serverRow({ client_id: clientId, exercise_id: 'squat', d: '2026-10-05', phase: 'strength', weight_lb: '135.0000', sets_count: 3, reps: '5.00', auto: false, ...fields }, over);

/* A small stand-in for the API: keeps rows by table and key, hands out versions and seqs, and understands the commands the
   adapter tests send. `fail` queues outcomes to return instead of answering, one per request. */

export function fakeServer() {
  type Stored = Record<string, any>;
  const rows = new Map<string, Stored>();
  let seq = 0;
  const sent: { name: CommandName; env: Envelope }[] = [];
  const fail: (CommandOutcome | PullOutcome)[] = [];
  let busy = 0;
  let overlapped = false;

  const stamp = (table: string, row: Stored): Stored => ({ table, ...row, seq: String(++seq) });
  const ok = (out: Stored[], status = 200): CommandOutcome => ({ ok: true, status, rows: out as never, cursor: String(seq) });
  const conflict = (reason: string, current: Stored | null): CommandOutcome => ({ ok: false, class: 'conflict', status: 409, reason, current: current as never });

  function apply(name: CommandName, env: Envelope): CommandOutcome {
    const input = env.input as any;
    const put = (table: string, key: string, row: Stored, base: number | null, opts: { restoreOk?: boolean } = {}): CommandOutcome => {
      const id = `${table}|${key}`;
      const have = rows.get(id);
      if (!have) {
        if (base !== null) return conflict('not-found', null);
        const made = stamp(table, { id: String(rows.size + 1), version: 1, deleted_at: null, ...row });
        rows.set(id, made);
        return ok([made], 201);
      }
      if (have.deleted_at) {
        if (base === null) return ok([have]);
        if (opts.restoreOk && base === have.version) { const back = stamp(table, { ...have, ...row, version: have.version + 1, deleted_at: null }); rows.set(id, back); return ok([back]); }
        return conflict('deleted', have);
      }
      if (base === null) return ok([have]);
      if (base !== have.version) return conflict('stale', have);
      const next = stamp(table, { ...have, ...row, version: have.version + 1 });
      rows.set(id, next);
      return ok([next]);
    };
    const kill = (table: string, key: string, base: number): CommandOutcome => {
      const have = rows.get(`${table}|${key}`);
      if (!have) return conflict('not-found', null);
      if (have.deleted_at) return ok([have]);
      if (base !== have.version) return conflict('stale', have);
      const gone = stamp(table, { ...have, version: have.version + 1, deleted_at: '2026-10-07T13:00:00.000Z' });
      rows.set(`${table}|${key}`, gone);
      return ok([gone]);
    };
    const entryRow = (): Stored => {
      const e = input.entry;
      return { client_id: env.clientId, exercise_id: input.exerciseId, d: e.d, phase: e.ph ?? null, weight_lb: e.w == null ? null : e.w.toFixed(4), sets_count: e.s ?? null, reps: e.r == null ? null : e.r.toFixed(2), hold_sec: null, sets: null, note: e.n ?? null, slot: e.slot ?? null, wk: e.wk ?? null, auto: !!e.auto, client_updated_at: null };
    };
    switch (name) {
      case 'log-session': case 'tick-card': return put('log_entries', env.clientId, entryRow(), env.baseVersion, { restoreOk: true });
      case 'delete-entry': return kill('log_entries', input.entryId, env.baseVersion ?? -1);
      case 'save-week': return put('weeks', input.weekStart, { week_start: input.weekStart, data: input.week }, env.baseVersion);
      case 'delete-week': return kill('weeks', input.weekStart, env.baseVersion ?? -1);
      case 'save-config': return put('config', 'config', { data: input.config }, env.baseVersion);
      default: return { ok: false, class: 'refused', status: 422, reason: `fake server does not know ${name}` };
    }
  }

  // Answers on microtasks only, so a test that lets the event loop turn once has seen every request finish, however busy
  // the machine is. Yielding once is enough to notice a second request starting before the first is done.
  const guard = async <T>(fn: () => T): Promise<T> => {
    if (busy++) overlapped = true;
    await Promise.resolve();
    try { return fn(); } finally { busy--; }
  };

  return {
    rows,
    sent,
    fail,
    /** True if two requests were ever in flight at once. */
    get overlapped() { return overlapped; },
    /** Puts a row on the server as if another device wrote it. */
    plant(table: string, key: string, row: Stored) { const made = stamp(table, { id: String(rows.size + 1), version: 1, deleted_at: null, ...row }); rows.set(`${table}|${key}`, made); return made; },
    transport: {
      command: (name: CommandName, env: Envelope): Promise<CommandOutcome> => guard(() => {
        sent.push({ name, env });
        return (fail.shift() as CommandOutcome | undefined) ?? apply(name, env);
      }),
      pull: (since: string, limit?: number): Promise<PullOutcome> => guard(() => {
        const next = fail.shift() as PullOutcome | undefined;
        if (next) return next;
        const all = [...rows.values()].filter(r => BigInt(r.seq) > BigInt(since)).sort((a, b) => Number(BigInt(a.seq) - BigInt(b.seq)));
        const page = limit ? all.slice(0, limit) : all;
        return { ok: true, rows: page as never, cursor: page.length ? page[page.length - 1]!.seq : since, more: page.length < all.length };
      }),
    },
  };
}

export const down = (cls: 'network' | 'server' | 'auth' | 'outdated' = 'network', retryAfterMs: number | null = null): CommandOutcome =>
  ({ ok: false, class: cls, status: cls === 'network' ? 0 : 503, retryAfterMs, message: `${cls} failure` });

/* A sleep the test controls: every wait is recorded and stays pending until released. */
export function gatedSleep() {
  const waits: number[] = [];
  const open: (() => void)[] = [];
  return {
    waits,
    sleep: (ms: number) => { waits.push(ms); return new Promise<void>(r => open.push(r)); },
    releaseAll() { open.splice(0).forEach(r => r()); },
    get waiting() { return open.length; },
  };
}

/* Runs `check` until it stops throwing, or rethrows its last error after `timeoutMs`. For waiting on work that happens in the
   background (a flush, a pull over a real network) without guessing how long it takes. */
export async function eventually<T>(check: () => T | Promise<T>, timeoutMs = 8000, everyMs = 10): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { return await check(); } catch (e) {
      if (Date.now() > deadline) throw e;
      await new Promise(r => setTimeout(r, everyMs));
    }
  }
}
