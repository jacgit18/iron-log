/* ---------- Storage (db with local fallback) ---------- */
export const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem('ironlog:' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('ironlog:' + k, JSON.stringify(v)); return true; } catch { return false; } }, // false: the browser refused the write (storage full or blocked)
  remove(k) { try { localStorage.removeItem('ironlog:' + k); } catch { /* ignore */ } },
};

// One write at a time per doc path; coalesces to the latest value if writes queue up while offline/slow.
// `db` is an optional Firestore-like handle: db.doc(path).set(data) / .delete(). Falls back to localStorage.
// A write that was refused for good is kept in `failed` (path -> data) until a later write of that path succeeds,
// so the app can say what isn't saved and try again. onFailed(paths, refused) is told whenever that list changes,
// with refused = true when it's because a write was just refused.
export function makeSaveQueue({ getDb, onFlag, onFailed = () => {} }) {
  const queues = {}; const failed = {};
  const fail = (path, data) => { failed[path] = data; onFailed(Object.keys(failed), true); };
  const ok = path => { if (path in failed) { delete failed[path]; onFailed(Object.keys(failed), false); } };
  function save(path, data) {
    const db = getDb();
    const q = queues[path] || (queues[path] = { busy: false, next: null });
    q.next = structuredClone(data);
    if (!db) { if (LS.set(path, q.next)) ok(path); else { fail(path, q.next); onFlag('Storage full'); } q.next = null; return; }
    if (q.busy) return;
    const run = async () => {
      q.busy = true;
      while (q.next) {
        const body = q.next; q.next = null;
        try {
          if (body.__delete) await db.doc(path).delete(); else await db.doc(path).set(body);
          ok(path); onFlag('Saved');
        } catch (e) {
          onFlag(e && e.code === 'quota_exceeded' ? 'Storage full' : 'Not saved, retrying…');
          await new Promise(r => setTimeout(r, 1500));
          // A permanent error drops this write only; a newer one queued meanwhile still gets its try.
          if (e && (e.code === 'invalid_argument' || e.code === 'revoked' || e.code === 'not_granted')) { fail(path, body); onFlag('Could not save'); }
          else if (!q.next) q.next = body;
        }
      }
      q.busy = false;
    };
    run();
  }
  function removeDoc(path) {
    const db = getDb();
    if (!db) { LS.remove(path); ok(path); return; }
    save(path, { __delete: true });
  }
  // A write of this path is in flight or queued: what the app holds for it is newer than the database.
  const pending = path => !!(queues[path] && (queues[path].busy || queues[path].next));
  const failedPaths = () => Object.keys(failed);
  function retryFailed() { Object.entries(failed).forEach(([path, data]) => (data.__delete ? removeDoc(path) : save(path, data))); }
  return { save, removeDoc, pending, failedPaths, retryFailed };
}
