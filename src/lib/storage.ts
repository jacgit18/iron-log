/* ---------- Storage (db with local fallback) ---------- */
// A saved value that no longer parses still reads as nothing, but its text is first kept under DAMAGED_PREFIX + key (the first damaged
// copy wins) and onDamaged listeners are told, so the next save cannot write over it unseen (EH-07). The prefix is outside 'ironlog:', so
// code that lists the app's own keys never picks a copy up.
export const DAMAGED_PREFIX = 'ironlog-damaged:';
type DamagedListener = (k: string) => void;
const damagedListeners = new Set<DamagedListener>();
const untold: string[] = []; // found before anyone listened (a module that reads at load); the first listener hears them
const told = new Set<string>(); // each key is told once a session, however often it is read
const clean = new Set<string>(); // read or written fine this session: a save need not check it again
function keepRaw(k: string, raw: string) {
  clean.delete(k);
  if (told.has(k)) return; // its copy was kept (or tried) the first time
  told.add(k);
  try { if (localStorage.getItem(DAMAGED_PREFIX + k) === null) localStorage.setItem(DAMAGED_PREFIX + k, raw); } catch { /* storage full or blocked: still told */ }
  if (damagedListeners.size) damagedListeners.forEach(fn => fn(k)); else untold.push(k);
}
/** Hears the key of each damaged value found. Returns the way to stop. */
export function onDamaged(fn: DamagedListener): () => void {
  damagedListeners.add(fn);
  untold.splice(0).forEach(k => fn(k));
  return () => { damagedListeners.delete(fn); };
}
// The stored text, or null when there is none or storage is blocked.
const rawOf = (k: string): string | null => { try { return localStorage.getItem('ironlog:' + k); } catch { return null; } };
const parses = (raw: string) => { try { JSON.parse(raw); return true; } catch { return false; } };

export const LS = {
  get(k: string): any {
    const raw = rawOf(k);
    if (raw === null) return null;
    try { const v = JSON.parse(raw); clean.add(k); return v; } catch { keepRaw(k, raw); return null; }
  },
  set(k: string, v: unknown): boolean { // false: the browser refused the write (storage full or blocked)
    if (!clean.has(k)) { const raw = rawOf(k); if (raw !== null && !parses(raw)) keepRaw(k, raw); }
    try { localStorage.setItem('ironlog:' + k, JSON.stringify(v)); clean.add(k); return true; } catch { return false; }
  },
  remove(k: string) { try { localStorage.removeItem('ironlog:' + k); } catch { /* ignore */ } },
  /** Keeps a value that parsed but is not the shape its reader needs, before the reader writes over it. */
  keepDamaged(k: string, v: unknown) { keepRaw(k, JSON.stringify(v)); },
  /** Removes every kept damaged copy (erasing this device's data). */
  forgetDamaged() {
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith(DAMAGED_PREFIX)) keys.push(key); }
      keys.forEach(key => localStorage.removeItem(key));
    } catch { /* ignore */ }
  },
};

// The GitHub backup feature is gone. Old versions kept a pasted token under this raw key; delete it so no secret is left behind.
export const LEGACY_GH_TOKEN_KEY = 'ironlog-gh-token';
export function removeLegacyGitHubToken() { try { localStorage.removeItem(LEGACY_GH_TOKEN_KEY); } catch { /* ignore */ } }

// One write at a time per doc path; coalesces to the latest value if writes queue up while offline/slow.
// `db` is an optional Firestore-like handle: db.doc(path).set(data) / .delete(). Falls back to localStorage.
// A write that was refused for good is kept in `failed` (path -> data) until a later write of that path succeeds,
// so the app can say what isn't saved and try again. onFailed(paths, refused) is told whenever that list changes,
// with refused = true when it's because a write was just refused.
// A db whose set() resolves with the document it now holds (the sync adapter, which may merge in another device's changes,
// ADR 031) tells onStored(path, doc) once the path has nothing more to send. A write queued meanwhile was made from the
// document before that merge, so rebase(path, sent, next, stored) carries the merge into it first.
type Db = { doc(path: string): { set(data: unknown): Promise<unknown>; delete(): Promise<unknown> } };
type Queue = { busy: boolean; next: any }
// A throw from one of these callbacks goes to onError (default: thrown again outside the queue, where the error reporter sees it) and
// never changes what happened to the write: one that went through is not sent again, and the path keeps saving (EH-11).
type QueueOptions = {
  getDb: () => Db | null; onFlag: (t: string) => void; onFailed?: (paths: string[], refused: boolean) => void;
  onStored?: (path: string, doc: unknown) => void; rebase?: (path: string, sent: unknown, next: unknown, stored: unknown) => unknown;
  onError?: (err: unknown) => void;
};
export function makeSaveQueue({ getDb, onFlag: flag, onFailed = () => {}, onStored = () => {}, rebase = (_p, _s, next) => next, onError = err => { setTimeout(() => { throw err; }); } }: QueueOptions) {
  const queues: Record<string, Queue> = {}; const failed: Record<string, any> = {};
  const guard = (fn: () => void) => { try { fn(); } catch (err) { onError(err); } };
  const onFlag = (t: string) => guard(() => flag(t));
  const fail = (path: string, data: unknown) => { failed[path] = data; guard(() => onFailed(Object.keys(failed), true)); };
  const ok = (path: string) => { if (path in failed) { delete failed[path]; guard(() => onFailed(Object.keys(failed), false)); } };
  function save(path: string, data: unknown): void {
    const db = getDb();
    const q = queues[path] || (queues[path] = { busy: false, next: null });
    q.next = structuredClone(data);
    if (!db) { if (LS.set(path, q.next)) ok(path); else { fail(path, q.next); onFlag('Storage full'); } q.next = null; return; }
    if (q.busy) return;
    const run = async () => {
      q.busy = true;
      try {
        while (q.next) {
          const body = q.next; q.next = null;
          let stored: unknown;
          try {
            stored = body.__delete ? await db.doc(path).delete() : await db.doc(path).set(body);
          } catch (err) {
            const e = err as { code?: string } | null;
            onFlag(e && e.code === 'quota_exceeded' ? 'Storage full' : 'Not saved, retrying…');
            await new Promise(r => setTimeout(r, 1500));
            // A permanent error drops this write only; a newer one queued meanwhile still gets its try.
            if (e && (e.code === 'invalid_argument' || e.code === 'revoked' || e.code === 'not_granted')) { fail(path, body); onFlag('Could not save'); }
            else if (!q.next) q.next = body;
            continue;
          }
          ok(path); onFlag('Saved');
          if (stored !== undefined && !body.__delete) guard(() => {
            if (!q.next) onStored(path, stored);
            else if (!q.next.__delete) q.next = rebase(path, body, q.next, stored);
          });
        }
      } finally { q.busy = false; }
    };
    run();
  }
  function removeDoc(path: string): void {
    const db = getDb();
    if (!db) { LS.remove(path); ok(path); return; }
    save(path, { __delete: true });
  }
  // A write of this path is in flight or queued: what the app holds for it is newer than the database.
  const pending = (path: string) => !!(queues[path] && (queues[path].busy || queues[path].next));
  const failedPaths = () => Object.keys(failed);
  function retryFailed() { Object.entries(failed).forEach(([path, data]) => (data.__delete ? removeDoc(path) : save(path, data))); }
  return { save, removeDoc, pending, failedPaths, retryFailed };
}
