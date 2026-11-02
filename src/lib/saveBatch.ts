// Holds document writes while a multi-document action runs, so they are queued together once it has finished,
// or dropped together when it fails (the store's `transact`). Pure: it only forwards to the writer it wraps.

export interface DocWriter {
  save(path: string, data: unknown): void;
  removeDoc(path: string): void;
}

type Held = { remove: true } | { remove: false; data: unknown };

export function makeBatchWriter(inner: DocWriter) {
  let held: Map<string, Held> | null = null;
  return {
    // While a batch is open a write replaces the held one for its path (the latest data wins, first-seen order is kept).
    save(path: string, data: unknown) { if (held) held.set(path, { remove: false, data: structuredClone(data) }); else inner.save(path, data); },
    removeDoc(path: string) { if (held) held.set(path, { remove: true }); else inner.removeDoc(path); },
    // false when a batch is already open: the caller joins it instead of starting another.
    begin() { if (held) return false; held = new Map(); return true; },
    // Queue what was held, in the order each path was first written.
    commit() {
      const writes = held; held = null;
      writes?.forEach((w, path) => { if (w.remove) inner.removeDoc(path); else inner.save(path, w.data); });
    },
    discard() { held = null; },
    isHeld: (path: string) => !!held?.has(path),
  };
}
