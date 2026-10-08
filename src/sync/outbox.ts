import type { Storage } from './mirrorStore.js';

/* ---------- What the user wrote that the server does not have yet ----------
   Two lists, both kept in the browser so a reload loses neither:
     pending     — the latest document for each path, waiting to be sent. Written before the app is told "saved", and
                   removed only once the server has taken it. This is the persisted queue (build spec, Phase D).
     quarantine  — writes the server refused. Never dropped (FM-02): they stay, are listed to the user, are part of the
                   manual export, and only the user can discard one. */

export const PENDING_KEY = 'sync/pending';
export const QUARANTINE_KEY = 'sync/quarantine';

/** A document to be removed. */
export interface Deleted { __delete: true }
export const isDeleted = (doc: unknown): doc is Deleted => !!doc && typeof doc === 'object' && (doc as Deleted).__delete === true;

export interface QuarantineEntry {
  id: string;
  path: string;
  /** What the user wrote (or Deleted). */
  doc: unknown;
  /** Why the server would not take it, in words the user can read. */
  reason: string;
  /** When it was set aside, as an ISO time. */
  at: string;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function createOutbox(storage: Storage, now: () => Date = () => new Date()) {
  const pending = new Map<string, unknown>();
  let quarantine: QuarantineEntry[] = [];
  let persisted = true;
  let counter = 0;

  const savedPending = storage.get(PENDING_KEY);
  if (isObject(savedPending)) for (const [path, doc] of Object.entries(savedPending)) pending.set(path, doc);
  const savedQuarantine = storage.get(QUARANTINE_KEY);
  if (Array.isArray(savedQuarantine)) {
    quarantine = savedQuarantine.filter((e): e is QuarantineEntry => isObject(e) && typeof e.id === 'string' && typeof e.path === 'string' && typeof e.reason === 'string' && typeof e.at === 'string' && 'doc' in e);
  }

  const savePending = () => { persisted = storage.set(PENDING_KEY, Object.fromEntries(pending)) && persisted; };
  const saveQuarantine = () => { persisted = storage.set(QUARANTINE_KEY, quarantine) && persisted; };

  return {
    /** The document waiting to be sent for this path, or undefined. */
    get: (path: string): unknown => pending.get(path),
    has: (path: string) => pending.has(path),
    paths: () => [...pending.keys()],

    /** Keeps `doc` as the latest for the path. False when the browser refused the write: it is held in memory only. */
    put(path: string, doc: unknown): boolean {
      pending.set(path, doc);
      persisted = true;
      savePending();
      return persisted;
    },

    /** The server has this document. Only removes it if it is still the one that was sent (a newer write stays). */
    done(path: string, sent: unknown) {
      if (pending.get(path) !== sent) return;
      pending.delete(path);
      persisted = true;
      savePending();
    },

    /** The server refused this document: move it to the quarantine so it is kept but not retried. */
    refuse(path: string, doc: unknown, reason: string): QuarantineEntry {
      const entry: QuarantineEntry = { id: `${now().getTime().toString(36)}-${(counter++).toString(36)}`, path, doc, reason, at: now().toISOString() };
      quarantine = [...quarantine, entry];
      if (pending.get(path) === doc) pending.delete(path);
      persisted = true;
      savePending();
      saveQuarantine();
      return entry;
    },

    quarantined: (): readonly QuarantineEntry[] => quarantine,

    /** Only the user decides to let a refused write go. */
    discard(id: string): boolean {
      const before = quarantine.length;
      quarantine = quarantine.filter(e => e.id !== id);
      if (quarantine.length === before) return false;
      persisted = true;
      saveQuarantine();
      return true;
    },

    /** Forgets everything, unsent writes and set-aside ones included. Only for handing the device to another account, after the user chose to. */
    clear() {
      pending.clear();
      quarantine = [];
      persisted = true;
      storage.remove(PENDING_KEY);
      storage.remove(QUARANTINE_KEY);
    },

    /** False when the browser has refused a write since the last good one: some of this is held in memory only. */
    persisted: () => persisted,
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
