import { backoffMs } from './backoff.js';
import { documentFor, parsePath, pathsOf, type PathKind } from './documents.js';
import { createMirrorStore, type Storage } from './mirrorStore.js';
import { createOutbox, isDeleted, type QuarantineEntry } from './outbox.js';
import { planCommands, planDelete } from './plan.js';
import { pullAll } from './pull.js';
import type { FailureClass, Transport } from './transport.js';
import type { PlannedCommand } from './types.js';

/* ---------- The database the store talks to, backed by the API ----------
   The store reads and writes through a small Firestore-like handle: db.doc(path).set / delete / onSnapshot and
   db.collection(name).onSnapshot / get. This is that handle, so the store, its tests and the protected board and log
   write paths stay exactly as they are (phase-d-brief.md, section 3).

   Writes. set(path, document) first keeps the document in the outbox, in the browser, and only then tries to send it:
   the app is told "saved" when the document is safe on this device, never earlier, and a reload loses nothing. Sending
   compares the document with the mirror (the rows the server is known to hold) and posts the smallest list of commands
   (plan.ts). If the network, the server or the sign-in is not available, the write waits and tries again, with backoff,
   and set() returns so the app is never held up: nothing is dropped (FM-02). A write the server refuses is moved to the
   quarantine, kept and listed, and set() rejects with a permanent error so the store lists the path as not saved.

   Reads. The first snapshot of a path waits for the first pull on this device (before that the mirror may be missing
   rows the server has), then every snapshot is the mirror's rows assembled into the document, or the pending document
   if this device has one that is not sent yet. Pulls run on start, when the app is focused or the network returns, and
   every minute while visible.

   One request at a time: pulls and sends take turns, so every plan sees the latest mirror. */

export type SyncState = 'starting' | 'idle' | 'syncing' | 'paused';
export type PauseReason = Exclude<FailureClass, 'refused' | 'conflict'>;

export interface SyncStatus {
  state: SyncState;
  pausedBecause: PauseReason | null;
  /** Documents written here that the server does not have yet. */
  pendingPaths: string[];
  /** Writes the server refused, kept for the user. */
  quarantined: number;
  lastPullAt: number | null;
  lastSyncedAt: number | null;
  /** False when the browser has refused a write: some of the above is held in memory only. */
  persisted: boolean;
  /** True once a pull has finished on this device, so the app can show the user's data. */
  ready: boolean;
}

export interface ApiDbOptions {
  transport: Pick<Transport, 'command' | 'pull'>;
  /** The browser's storage (`LS` from lib/storage), or a stand-in in tests. */
  storage: Storage;
  /** Waits; injected so tests do not. */
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  /** How often to pull while the app is visible. 0 turns the timer off (tests). */
  pollMs?: number;
  /** Is the app on screen? Pulls on the timer are skipped when it is not. */
  visible?: () => boolean;
  /** Calls back when the app returns to the foreground or the network comes back; returns how to stop listening. */
  onWake?: (wake: () => void) => () => void;
}

interface Snap { exists: boolean; data(): any }
type Listener = { cb: (snap: any) => void; err?: (e: unknown) => void };

const POLL_MS = 60_000;
const MAX_CONFLICTS = 3;
const MAX_PASSES = 6;

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));
const docSnap = (doc: unknown): Snap => ({ exists: doc != null, data: () => clone(doc) });
const permanent = (message: string) => Object.assign(new Error(message), { code: 'invalid_argument' });

export function createApiDb(options: ApiDbOptions) {
  const { transport, storage } = options;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const now = options.now ?? Date.now;
  const pollMs = options.pollMs ?? POLL_MS;
  const visible = options.visible ?? (() => true);

  const mirror = createMirrorStore(storage);
  const outbox = createOutbox(storage, () => new Date(now()));

  let state: SyncState = 'starting';
  let pausedBecause: PauseReason | null = null;
  let lastPullAt: number | null = null;
  let lastSyncedAt: number | null = null;
  const statusListeners = new Set<(s: SyncStatus) => void>();
  const status = (): SyncStatus => ({
    state, pausedBecause, pendingPaths: outbox.paths(), quarantined: outbox.quarantined().length, lastPullAt, lastSyncedAt,
    persisted: mirror.persisted() && outbox.persisted(), ready: mirror.hasPulled(),
  });
  const announce = () => { const s = status(); statusListeners.forEach(cb => { try { cb(s); } catch { /* a listener must not stop sync */ } }); };
  // Calls waiting for the sync to pause. A write that is safe on this device does not need to wait for a server that
  // cannot be reached, so these let it return the moment sync pauses.
  const pauseWaiters = new Set<() => void>();
  const setState = (next: SyncState, because: PauseReason | null = null) => {
    if (state === next && pausedBecause === because) return;
    state = next;
    pausedBecause = because;
    if (next === 'paused') { const waiting = [...pauseWaiters]; pauseWaiters.clear(); waiting.forEach(w => w()); }
    announce();
  };

  /* ---------- one request at a time ---------- */
  let chain: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
  };

  /* ---------- waiting, and being woken ---------- */
  const wakers = new Set<() => void>();
  const wake = () => { [...wakers].forEach(w => w()); };
  async function waitFor(ms: number) {
    let release!: () => void;
    const woken = new Promise<void>(r => { release = r; wakers.add(r); });
    try { await Promise.race([sleep(ms), woken]); } finally { wakers.delete(release); }
  }

  /* ---------- reading ---------- */
  const docListeners = new Map<string, Set<Listener>>();
  const collectionListeners = new Map<string, Set<Listener>>();

  // The document for a path as this device sees it: what it wrote and has not sent, else what the server holds.
  function localDoc(path: string): unknown {
    const pending = outbox.get(path);
    if (pending !== undefined) return isDeleted(pending) ? null : pending;
    const kind = parsePath(path);
    return kind ? documentFor(kind, mirror.rows()) : storage.get(path);
  }
  // Paths that are not synced (anything the app keeps for itself) stay in the browser, as they always did.
  const isSynced = (path: string) => parsePath(path) !== null;
  const readyFor = (path: string) => !isSynced(path) || mirror.hasPulled();

  function collectionIds(name: string): string[] {
    const prefix = `${name}/`;
    const ids = new Set<string>();
    outbox.paths().forEach(p => { if (p.startsWith(prefix)) ids.add(p.slice(prefix.length)); });
    for (const row of mirror.rows().values()) pathsOf(row).forEach(p => { if (p.startsWith(prefix)) ids.add(p.slice(prefix.length)); });
    return [...ids].sort();
  }
  function collectionSnap(name: string) {
    const docs = collectionIds(name)
      .map(id => ({ id, doc: localDoc(`${name}/${id}`) }))
      .filter(d => d.doc != null)
      .map(d => ({ id: d.id, exists: true, data: (): any => clone(d.doc) }));
    return { docs, empty: docs.length === 0, size: docs.length };
  }

  const deliver = (l: Listener, snap: unknown) => {
    try { l.cb(snap); } catch (e) { console.error(JSON.stringify({ msg: 'a snapshot listener threw', error: e instanceof Error ? e.message : String(e) })); }
  };
  function emitPath(path: string) {
    docListeners.get(path)?.forEach(l => deliver(l, docSnap(localDoc(path))));
    const slash = path.indexOf('/');
    if (slash > 0) {
      const name = path.slice(0, slash);
      const ls = collectionListeners.get(name);
      if (ls?.size) { const snap = collectionSnap(name); ls.forEach(l => deliver(l, snap)); }
    }
  }
  const emitPaths = (paths: Iterable<string>) => { for (const p of new Set(paths)) emitPath(p); };
  const emitAll = () => {
    docListeners.forEach((_, path) => emitPath(path));
    collectionListeners.forEach((ls, name) => { const snap = collectionSnap(name); ls.forEach(l => deliver(l, snap)); });
  };

  function subscribe(map: Map<string, Set<Listener>>, key: string, l: Listener, ready: boolean, first: () => unknown) {
    (map.get(key) ?? map.set(key, new Set()).get(key)!).add(l);
    if (ready) queueMicrotask(() => { if (map.get(key)?.has(l)) deliver(l, first()); });
    return () => { map.get(key)?.delete(l); };
  }

  /* ---------- pulling ---------- */
  function pull(): Promise<void> {
    return exclusive(async () => {
      const wasReady = mirror.hasPulled();
      const out = await pullAll(transport, mirror);
      if (out.ok) {
        lastPullAt = now();
        if (!outbox.paths().length) lastSyncedAt = lastPullAt;
        setState('idle');
        if (!wasReady && mirror.hasPulled()) emitAll();
        else emitPaths(out.paths);
        return;
      }
      // Whatever pages did arrive are in the mirror; the rest waits for the next try.
      if (out.paths.length) emitPaths(out.paths);
      setState('paused', out.class);
    });
  }
  let pulling: Promise<void> | null = null;
  const syncNow = (): Promise<void> => (pulling ??= pull().finally(() => { pulling = null; }));

  /* ---------- sending ---------- */
  const planKey = (cmds: PlannedCommand[]) => cmds.map(c => `${c.name}|${c.rowKey}|${c.baseVersion}`).join(';');

  function refuse(path: string, sent: unknown, reason: string) {
    outbox.refuse(path, sent, reason);
    announce();
    return { refused: reason };
  }

  // Sends the latest document for one path until the server has it, or refuses it. `onPause` is told the first time
  // the write has to wait, so the caller can stop holding the app up.
  async function flushPath(path: string, onPause: () => void): Promise<{ refused?: string }> {
    const kind = parsePath(path) as PathKind;
    const touched = new Set<string>();
    let attempt = 0; // consecutive waits, for the backoff
    let conflicts = 0;
    let passes = 0; // passes in which every command was accepted
    let lastDone = ''; // the plan of the last such pass
    for (;;) {
      const sent = outbox.get(path);
      if (sent === undefined) return {}; // a newer call already took care of it
      const cmds = isDeleted(sent) ? planDelete(kind, mirror.rows()) : planCommands(kind, sent, mirror.rows());
      if (!cmds.length) {
        outbox.done(path, sent);
        lastSyncedAt = now();
        touched.delete(path);
        setState('idle');
        emitPaths(touched); // anything else the server changed on the way (the shared config row)
        return {};
      }
      // Every command of the last pass was accepted and the same ones are still needed: the server is answering but not
      // changing, and sending them again would never end. Set the write aside instead of looping.
      const key = planKey(cmds);
      if (key === lastDone || passes >= MAX_PASSES) return refuse(path, sent, 'The server answered but the data did not change, so this was set aside.');

      let again = false;
      for (const c of cmds) {
        setState('syncing');
        const out = await transport.command(c.name, { clientId: c.clientId, baseVersion: c.baseVersion, input: c.input });
        if (out.ok) {
          attempt = 0;
          mirror.apply(c.table, out.rows).paths.forEach(p => touched.add(p));
          continue;
        }
        if (out.class === 'refused') return refuse(path, sent, `The server would not take this (${out.reason}).`);
        if (out.class === 'conflict') {
          if (out.reason === 'deleted') return refuse(path, sent, 'This was deleted on another device after you changed it.');
          if (out.reason !== 'stale') return refuse(path, sent, `The server does not have what this was based on (${out.reason}).`);
          if (out.current) mirror.apply(c.table, [out.current]);
          if (++conflicts > MAX_CONFLICTS) return refuse(path, sent, 'This kept changing on another device, so it was set aside.');
          again = true; // the mirror now holds the newer row: plan again
          break;
        }
        // The network, the server, the sign-in or the app version: wait, then plan again from the latest mirror.
        setState('paused', out.class);
        onPause();
        await waitFor(backoffMs(attempt++, out.retryAfterMs, options.random));
        again = true;
        break;
      }
      if (!again) { lastDone = key; passes++; }
    }
  }

  function set(path: string, data: unknown): Promise<void> {
    if (!isSynced(path)) {
      const ok = isDeleted(data) ? (storage.remove(path), true) : storage.set(path, data);
      if (!ok) return Promise.reject(Object.assign(new Error('storage full'), { code: 'quota_exceeded' }));
      emitPath(path);
      return Promise.resolve();
    }
    const body = clone(data);
    outbox.put(path, body); // safe on this device before anyone is told "saved"
    announce();
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const accept = () => { if (!settled) { settled = true; pauseWaiters.delete(accept); resolve(); } };
      const fail = (e: unknown) => { if (!settled) { settled = true; pauseWaiters.delete(accept); reject(e); } };
      // Already paused, or pausing while this waits its turn: it is safe in the outbox, so the app can carry on.
      if (state === 'paused') accept();
      else pauseWaiters.add(accept);
      exclusive(() => flushPath(path, accept)).then(r => (r.refused ? fail(permanent(r.refused)) : accept()), fail);
    });
  }

  const docRef = (path: string) => ({
    set: (data: unknown) => set(path, data),
    delete: () => set(path, { __delete: true }),
    get: async () => docSnap(readyFor(path) ? localDoc(path) : null),
    onSnapshot: (cb: (s: Snap) => void, err?: (e: unknown) => void) => subscribe(docListeners, path, { cb, err }, readyFor(path), () => docSnap(localDoc(path))),
  });
  const collectionRef = (name: string) => ({
    get: async () => collectionSnap(name),
    onSnapshot: (cb: (s: ReturnType<typeof collectionSnap>) => void, err?: (e: unknown) => void) =>
      subscribe(collectionListeners, name, { cb, err }, mirror.hasPulled(), () => collectionSnap(name)),
  });

  /* ---------- starting and stopping ---------- */
  let started = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let unwake: (() => void) | null = null;
  const tick = () => {
    if (!started) return;
    if (visible()) void syncNow();
    timer = setTimeout(tick, pollMs);
  };

  function start() {
    if (started) return;
    started = true;
    // Finish what an earlier session left unsent, then pull.
    outbox.paths().forEach(path => { void exclusive(() => flushPath(path, () => {})).catch(() => undefined); });
    void syncNow();
    if (pollMs > 0) timer = setTimeout(tick, pollMs);
    unwake = options.onWake?.(() => { wake(); void syncNow(); }) ?? null;
  }
  function stop() {
    started = false;
    if (timer) clearTimeout(timer);
    timer = null;
    unwake?.();
    unwake = null;
  }

  return {
    doc: docRef,
    collection: collectionRef,
    start,
    stop,
    /** Pulls now and wakes anything waiting to retry (after signing in, or when the network returns). */
    resume: () => { wake(); return syncNow(); },
    syncNow,
    status,
    onStatus(cb: (s: SyncStatus) => void) { statusListeners.add(cb); return () => { statusListeners.delete(cb); }; },
    quarantined: (): readonly QuarantineEntry[] => outbox.quarantined(),
    /** Only the user lets a refused write go. */
    discard: (id: string) => { const ok = outbox.discard(id); if (ok) announce(); return ok; },
  };
}

export type ApiDb = ReturnType<typeof createApiDb>;
