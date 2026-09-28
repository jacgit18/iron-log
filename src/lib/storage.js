/* ---------- Storage (db with local fallback) ---------- */
export const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem('ironlog:' + k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem('ironlog:' + k, JSON.stringify(v)); } catch { /* ignore */ } },
  remove(k) { try { localStorage.removeItem('ironlog:' + k); } catch { /* ignore */ } },
};

// One write at a time per doc path; coalesces to the latest value if writes queue up while offline/slow.
// `db` is an optional Firestore-like handle: db.doc(path).set(data) / .delete(). Falls back to localStorage.
export function makeSaveQueue({ getDb, onFlag }) {
  const queues = {};
  function save(path, data) {
    const db = getDb();
    const q = queues[path] || (queues[path] = { busy: false, next: null });
    q.next = structuredClone(data);
    if (!db) { LS.set(path, q.next); q.next = null; return; }
    if (q.busy) return;
    const run = async () => {
      q.busy = true;
      while (q.next) {
        const body = q.next; q.next = null;
        try {
          if (body.__delete) await db.doc(path).delete(); else await db.doc(path).set(body);
          onFlag('Saved');
        } catch (e) {
          onFlag(e && e.code === 'quota_exceeded' ? 'Storage full' : 'Not saved, retrying…');
          await new Promise(r => setTimeout(r, 1500));
          if (!q.next) q.next = body;
          if (e && (e.code === 'invalid_argument' || e.code === 'revoked' || e.code === 'not_granted')) { q.next = null; onFlag('Could not save'); }
        }
      }
      q.busy = false;
    };
    run();
  }
  function removeDoc(path) {
    const db = getDb();
    if (!db) { LS.remove(path); return; }
    save(path, { __delete: true });
  }
  return { save, removeDoc };
}
