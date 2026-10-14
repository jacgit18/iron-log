import type { AccountState } from './account.js';
import { backoffMs } from './backoff.js';
import { desiredRows, documentFor, parsePath, pathsOf, scopeRows, type PathKind } from './documents.js';
import { entryId } from '../lib/export.js';
import { createMirrorStore, type Storage } from './mirrorStore.js';
import { mergeStretchWeek3, mergeWeek3 } from './merge.js';
import { createOutbox, isDeleted, type QuarantineEntry } from './outbox.js';
import { planCommands, planDelete } from './plan.js';
import { canonOf } from './canon.js';
import { ownChanges } from './ownChanges.js';
import { pullAll } from './pull.js';
import type { AccountActionOutcome, FailureClass, ImportOutcome, Transport } from './transport.js';
import { mirrorId, type PlannedCommand } from './types.js';

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
/** 'account': the device holds data of another account than the one now signed in; nothing is sent until the user chooses. */
export type PauseReason = Exclude<FailureClass, 'refused' | 'conflict'> | 'account';

/** Whose data this device holds, remembered as { userId } so a different account signing in is noticed. */
export const OWNER_KEY = 'sync/owner';

export interface SyncStatus {
  state: SyncState;
  pausedBecause: PauseReason | null;
  /** Documents written here that the server does not have yet. */
  pendingPaths: string[];
  /** Writes the server refused, kept for the user. */
  quarantined: number;
  /** The same writes in full, for the screen that lists them. */
  quarantine: readonly QuarantineEntry[];
  lastPullAt: number | null;
  lastSyncedAt: number | null;
  /** False when the browser has refused a write: some of the above is held in memory only. */
  persisted: boolean;
  /** True once a pull has finished on this device, so the app can show the user's data. */
  ready: boolean;
  /** True when this device holds any row of the account or any unsent change: the one-time upload of old data needs this to be false. */
  holdsData: boolean;
  /** Things that happened because another device changed something first, worth telling the user. Newest last. */
  notices: Notice[];
}

export interface Notice {
  id: number;
  path: string;
  text: string;
  at: string;
}

export interface ApiDbOptions {
  transport: Pick<Transport, 'command' | 'pull'> & Partial<Pick<Transport, 'importLegacy' | 'eraseData' | 'deleteAccount'>>;
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
  /** Who is signed in right now. When given, nothing is pulled or sent until the signed-in account is known to be the one this
   *  device's data belongs to (build spec B2e); without it (tests, or no accounts) the check is skipped. */
  identity?: () => Promise<AccountState>;
  /** Called when this device is handed to a different account (an empty device taken over, or the user chose to wipe it), so the app can
   *  forget what it keeps outside the sync, such as the grocery list. Not called when the same account signs in again. */
  onOwnerChange?: () => void;
  /** Calls back when the app returns to the foreground or the network comes back; returns how to stop listening. */
  onWake?: (wake: () => void) => () => void;
}

interface Snap { exists: boolean; data(): any }
type Listener = { cb: (snap: any) => void; err?: (e: unknown) => void };

const POLL_MS = 60_000;
const MAX_CONFLICTS = 3;
// An app that is too old stays too old until it is updated, so retrying every minute only adds noise: wait this long.
export const OUTDATED_WAIT_MS = 5 * 60_000;
const MAX_PASSES = 6;

const isObjectLike = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
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
  let notices: Notice[] = [];
  let noticeId = 0;
  const note = (path: string, text: string) => {
    notices = [...notices, { id: ++noticeId, path, text, at: new Date(now()).toISOString() }].slice(-20);
  };
  const status = (): SyncStatus => ({
    state, pausedBecause, pendingPaths: outbox.paths(), quarantined: outbox.quarantined().length, quarantine: outbox.quarantined(), lastPullAt, lastSyncedAt,
    persisted: mirror.persisted() && outbox.persisted(), ready: mirror.hasPulled(), holdsData: hasData(), notices,
  });
  const announce = () => { const s = status(); statusListeners.forEach(cb => { try { cb(s); } catch { /* a listener must not stop sync */ } }); };
  // Calls waiting for the sync to pause. A write that is safe on this device does not need to wait for a server that
  // cannot be reached, so these let it return the moment sync pauses.
  const pauseWaiters = new Set<() => void>();
  const setState = (next: SyncState, because: PauseReason | null = null) => {
    if (state === next && pausedBecause === because) return;
    state = next;
    pausedBecause = because;
    if (next === 'paused' && (because === 'auth' || because === 'account')) verified = false; // ask again who is signed in
    if (next === 'paused') { const waiting = [...pauseWaiters]; pauseWaiters.clear(); waiting.forEach(w => w()); }
    announce();
  };

  /* ---------- whose data this device holds ---------- */
  // The first account that syncs here owns the device's data. A different account signing in must never see it or add to it:
  // pulls would mix two users' rows under one cursor, and an unsent change of the first would reach the second.
  let verified = false;
  // Set while this device is erasing the account's data or deleting the account, and left set (the page reloads): nothing is pulled or sent
  // meanwhile, or a send already on its way could put a row back on the server after it was erased.
  let halted = false;
  const readOwner = (): string | null => {
    const saved = storage.get(OWNER_KEY);
    return isObjectLike(saved) && typeof saved.userId === 'string' ? saved.userId : null;
  };
  const hasData = () => mirror.rows().size > 0 || outbox.paths().length > 0 || outbox.quarantined().length > 0;
  const adopt = (userId: string) => { storage.set(OWNER_KEY, { userId }); verified = true; };
  type Gate = { ok: true } | { ok: false; because: PauseReason };
  async function gate(): Promise<Gate> {
    if (!options.identity || verified) return { ok: true };
    const who = await options.identity();
    if (who.status === 'unreachable') return { ok: false, because: 'network' };
    if (who.status === 'signed-out') return { ok: false, because: 'auth' };
    const owner = readOwner();
    if (owner === null || owner === who.userId) { adopt(who.userId); return { ok: true }; }
    // Another account. With nothing here to protect, hand the device over; the old cursor belongs to the old account, so it goes.
    if (!hasData()) { mirror.clear(); adopt(who.userId); options.onOwnerChange?.(); return { ok: true }; }
    return { ok: false, because: 'account' };
  }

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
      if (halted) return;
      const allowed = await gate();
      if (!allowed.ok) { setState('paused', allowed.because); return; }
      const wasReady = mirror.hasPulled();
      // This device's copy of the server rows before the pull: if the pull shows an erase from another device it empties the copy, and
      // what this device changed itself is told apart from what it only carried by comparing with this. Taken every time (one Map copy
      // per pull): a save can land while the pull is on its way, after any "is there anything to compare" check here.
      const before = new Map(mirror.rows());
      const out = await pullAll(transport, mirror);
      if (out.ok) {
        lastPullAt = now();
        if (!outbox.paths().length) lastSyncedAt = lastPullAt;
        setState('idle');
        if (!wasReady && mirror.hasPulled()) emitAll();
        else emitPaths(out.paths);
        if (out.reset) {
          // The account's data was erased from another device: every document is different now. This device's unsent and set-aside
          // writes were made from the old data: sent whole (against the emptied mirror, or by Try again) they would bring the erased
          // history back, as a log document holds every session of an exercise. So they go, except what this device added or changed
          // itself (sessions logged offline meanwhile), which is set aside on its own for the user to send again or discard.
          const held = new Map<string, unknown>();
          for (const q of outbox.quarantined()) held.set(q.path, q.doc); // older first, so a newer one for the same path wins
          for (const path of outbox.paths()) held.set(path, outbox.get(path));
          if (held.size) {
            const kept: [string, unknown][] = [];
            for (const [path, doc] of held) {
              const kind = parsePath(path);
              const own = kind ? ownChanges(kind, doc, before) : null;
              if (own != null) kept.push([path, own]);
            }
            outbox.clear(); bases.clear(); retryKeep.clear();
            // Set aside with no versions seen: Try again only adds, leaving whatever the account holds by then as it is.
            for (const [path, own] of kept) outbox.refuse(path, own, 'Made on this device before the account was erased on another device. Send it again to add it to the account, or discard it.', { seen: {} });
            const n = (k: number, one: string, many: string) => (k === 1 ? one : `${k} ${many}`);
            note('', kept.length
              ? `Everything in this account was erased on another device. What this device changed itself (${n(kept.length, 'one item', 'items')}) is kept under Not sent, to send again or discard; the rest was dropped.`
              : `Everything in this account was erased on another device, so ${n(held.size, 'a change', 'changes')} from here ${held.size === 1 ? 'was' : 'were'} dropped.`);
            lastSyncedAt = lastPullAt;
          }
          emitAll(); announce();
        }
        if (out.paths.length) announce(); // rows arrived: the status (holdsData) changed even though the state did not
        return;
      }
      // Whatever pages did arrive are in the mirror; the rest waits for the next try.
      if (out.paths.length) emitPaths(out.paths);
      setState('paused', out.class);
    });
  }
  // One pull at a time. A caller that asks while one is running may be waiting for something that happened after that pull
  // began, so it gets one more pull after it (shared by everyone who asks meanwhile), never the running one's answer.
  let pulling: Promise<void> | null = null;
  let followUp: Promise<void> | null = null;
  const syncNow = (): Promise<void> => {
    if (!pulling) {
      pulling = pull().finally(() => { pulling = null; });
      return pulling;
    }
    return (followUp ??= pulling.then(() => { followUp = null; return syncNow(); }));
  };

  /* ---------- sending ---------- */
  const planKey = (cmds: PlannedCommand[]) => cmds.map(c => `${c.name}|${c.rowKey}|${c.baseVersion}`).join(';');

  // ADR 031 before sending, not only on a stale answer: an unsent week remembers the server row it was made from. A pull can land
  // between the app's save and the send (opening the app pulls, and a tap waits behind it); planned against that newer row, the save
  // went out as a plain edit of it and wiped what the other device ticked. undefined: not a week path. null: no row when it was made.
  const bases = new Map<string, { version: number; week: unknown } | null>();
  const weekRow = (path: string): { version: number; week: unknown } | null | undefined => {
    const p = parsePath(path);
    if (!p || (p.kind !== 'weeks' && p.kind !== 'stretchweeks')) return undefined;
    const r = mirror.rows().get(mirrorId(p.kind === 'weeks' ? 'weeks' : 'stretch_weeks', p.weekStart));
    return r && !r.deleted && (r.table === 'weeks' || r.table === 'stretch_weeks') ? { version: r.version, week: r.week } : null;
  };
  const rememberBase = (path: string) => { const b = weekRow(path); if (b !== undefined) bases.set(path, b); };

  // What the server held for a path when a change to it was set aside: Try again leaves alone whatever changed after (see retry).
  const seenNow = (path: string) => {
    const kind = parsePath(path);
    if (!kind) return {};
    const seen: Record<string, number> = {};
    for (const r of scopeRows(kind, mirror.rows())) if (!r.deleted) seen[mirrorId(r.table, r.key)] = r.version;
    const w = weekRow(path);
    return w ? { seen, baseWeek: w.week } : { seen };
  };
  // Rows a Try again must leave as they are (changed on the server since the refusal, or not in the old copy), by path, for its send.
  // `doc` is the copy Try again put in the outbox: the rows apply only while that copy is what is being sent. A newer save to the
  // same path (made while the retry waited) is this device's own latest word and is planned as usual.
  const retryKeep = new Map<string, { doc: unknown; rows: Set<string> }>();

  function refuse(path: string, sent: unknown, reason: string) {
    bases.delete(path); retryKeep.delete(path);
    outbox.refuse(path, sent, reason, seenNow(path));
    setState('idle'); // this write is no longer being sent; whatever is next sets the state again
    announce();
    return { refused: reason };
  }

  // Sends the latest document for one path until the server has it, or refuses it. `onPause` is told the first time
  // the write has to wait, so the caller can stop holding the app up.
  async function flushPath(path: string, onPause: () => void): Promise<{ refused?: string }> {
    const kind = parsePath(path) as PathKind;
    const touched = new Set<string>();
    const adjusted = new Set<string>(); // paths whose document this changed to match the server, so the app must be told
    const kept = new Set<string>(); // rows another device changed after this phone saw them, so a delete of them is skipped
    let attempt = 0; // consecutive waits, for the backoff
    let conflicts = 0;
    let passes = 0; // passes in which every command was accepted
    let lastDone = ''; // the plan of the last such pass
    for (;;) {
      if (halted) return {};
      const allowed = await gate();
      if (!allowed.ok) {
        setState('paused', allowed.because);
        onPause();
        // Another account waits for the user's choice, so it does not retry on a timer; the choice wakes it.
        await waitFor(allowed.because === 'account' ? OUTDATED_WAIT_MS : backoffMs(attempt++, null, options.random));
        continue;
      }
      const sent = outbox.get(path);
      if (sent === undefined) return {}; // a newer call already took care of it
      if (!isDeleted(sent) && bases.has(path)) {
        const base = bases.get(path)!; const cur = weekRow(path);
        if (cur && cur.version !== base?.version) {
          rememberBase(path);
          const m = kind.kind === 'weeks' ? mergeWeek3(base ? base.week : null, sent, cur.week) : mergeStretchWeek3(base ? base.week : null, sent, cur.week);
          if (m.tookTheirs) {
            outbox.put(path, m.week);
            adjusted.add(path);
            note(path, 'Merged changes from another device.');
            continue; // plan the merged week
          }
        }
      }
      const retried = retryKeep.get(path);
      if (retried && retried.doc !== sent) retryKeep.delete(path); // replaced by a newer save: that one is sent as usual
      const asIs = retried && retried.doc === sent ? retried.rows : undefined;
      const cmds = isDeleted(sent) ? planDelete(kind, mirror.rows(), asIs ? new Set([...kept, ...asIs]) : kept) : planCommands(kind, sent, mirror.rows(), kept, asIs);
      if (!cmds.length) {
        outbox.done(path, sent);
        if (retryKeep.get(path)?.doc === sent) retryKeep.delete(path); // that copy is on the server now
        // A week saved meanwhile was made from this one, which the server now holds.
        if (outbox.get(path) === undefined) bases.delete(path); else rememberBase(path);
        lastSyncedAt = now();
        adjusted.forEach(p => touched.add(p));
        if (!adjusted.has(path)) touched.delete(path);
        setState('idle');
        emitPaths(touched); // anything else the server changed on the way (the shared config row), and this path if it was adjusted
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
          // A check-off that was not made because the card already has one (another phone ticked it, or a session was
          // logged for it): the server's row is the one check-off, so it takes the place of this phone's own in the
          // document. (Dropping this phone's tick without adding the server's would make the next plan delete it.)
          if (c.name === 'tick-card' && out.rows.length === 1 && String(out.rows[0]!.client_id) !== c.clientId) {
            const doc = outbox.get(path) as { entries?: unknown[] } | undefined;
            const theirs = mirror.rows().get(mirrorId('log_entries', String(out.rows[0]!.client_id)));
            if (doc && Array.isArray(doc.entries) && theirs && theirs.table === 'log_entries' && !theirs.deleted) {
              const entries = doc.entries.filter(e => entryId(e as never) !== c.rowKey);
              if (!entries.some(e => entryId(e as never) === theirs.key)) entries.push(theirs.entry);
              outbox.put(path, { ...doc, entries });
              adjusted.add(path);
              note(path, 'This card was already checked off or logged on another device, so your tick was not added.');
              again = true;
              break;
            }
          }
          continue;
        }
        if (out.class === 'refused') return refuse(path, sent, `The server would not take this (${out.reason}).`);
        if (out.class === 'conflict') {
          if (out.reason === 'deleted') return refuse(path, sent, 'This was deleted on another device after you changed it.');
          if (out.reason !== 'stale') return refuse(path, sent, `The server does not have what this was based on (${out.reason}).`);
          // The row this save was based on, read before the server's newer row replaces it: the base of a week's three-way merge.
          const seen = mirror.rows().get(mirrorId(c.table, c.rowKey));
          const base = seen && !seen.deleted && seen.version === c.baseVersion ? seen : undefined;
          if (out.current) mirror.apply(c.table, [out.current]).paths.forEach(p => touched.add(p));
          if (c.name.startsWith('delete-')) {
            // A delete must not win silently over an edit made after the version it was based on (FM-05): keep the edit.
            kept.add(mirrorId(c.table, c.rowKey));
            adjusted.add(path);
            note(path, 'Something you deleted was changed on another device first, so it was kept.');
            again = true;
            break;
          }
          if (++conflicts > MAX_CONFLICTS) return refuse(path, sent, 'This kept changing on another device, so it was set aside.');
          if (c.table === 'weeks' || c.table === 'stretch_weeks') {
            // ADR 031: a week is merged three-way, so what the other device changed survives; a key both changed is this device's.
            const theirs = mirror.rows().get(mirrorId(c.table, c.rowKey));
            if (theirs && !theirs.deleted && (theirs.table === 'weeks' || theirs.table === 'stretch_weeks')) {
              const baseWeek = base && (base.table === 'weeks' || base.table === 'stretch_weeks') ? base.week : null;
              const m = c.table === 'weeks' ? mergeWeek3(baseWeek, sent, theirs.week) : mergeStretchWeek3(baseWeek, sent, theirs.week);
              if (m.tookTheirs) {
                outbox.put(path, m.week);
                adjusted.add(path);
                note(path, m.unskipped
                  ? (c.table === 'weeks' ? 'A card you skipped was ticked on another device, so it is shown as done.' : 'A day you skipped had a stretch ticked on another device, so it is no longer skipped.')
                  : 'Merged changes from another device.');
              }
            }
            if (bases.has(path)) rememberBase(path); // what is in the outbox now holds the server's row
          }
          again = true; // the mirror now holds the newer row: plan again
          break;
        }
        // The network, the server, the sign-in or the app version: wait, then plan again from the latest mirror.
        setState('paused', out.class);
        onPause();
        const wait = backoffMs(attempt++, out.retryAfterMs, options.random);
        await waitFor(out.class === 'outdated' ? Math.max(wait, OUTDATED_WAIT_MS) : wait);
        again = true;
        break;
      }
      if (!again) { lastDone = key; passes++; }
    }
  }

  // Resolves with the document this device now holds for the path (a merge may have added another device's changes), or
  // undefined when the write was only kept in the outbox because sending is paused.
  function set(path: string, data: unknown): Promise<unknown> {
    if (!isSynced(path)) {
      const ok = isDeleted(data) ? (storage.remove(path), true) : storage.set(path, data);
      if (!ok) return Promise.reject(Object.assign(new Error('storage full'), { code: 'quota_exceeded' }));
      emitPath(path);
      return Promise.resolve();
    }
    const body = clone(data);
    if (!bases.has(path) && outbox.get(path) === undefined) rememberBase(path); // an unsent week keeps the base of the first one
    outbox.put(path, body); // safe on this device before anyone is told "saved"
    announce();
    return new Promise<unknown>((resolve, reject) => {
      let settled = false;
      const accept = (doc?: unknown) => { if (!settled) { settled = true; pauseWaiters.delete(accept); resolve(doc); } };
      const fail = (e: unknown) => { if (!settled) { settled = true; pauseWaiters.delete(accept); reject(e); } };
      // Already paused, or pausing while this waits its turn: it is safe in the outbox, so the app can carry on.
      if (state === 'paused') accept();
      else pauseWaiters.add(accept);
      exclusive(() => flushPath(path, accept)).then(r => (r.refused ? fail(permanent(r.refused)) : accept(isDeleted(body) ? undefined : clone(localDoc(path)))), fail);
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
  // The session cookie is shared by every tab of the browser, so another tab can sign in as someone else without this one
  // seeing a 401. Ask who is signed in again whenever the app wakes or the timer fires, before anything is pulled or sent.
  const recheckWho = () => { verified = false; };
  let timer: ReturnType<typeof setTimeout> | null = null;
  let unwake: (() => void) | null = null;
  const tick = () => {
    if (!started) return;
    // The timer does not poke an app the server has said is too old; coming back to the app or the network still tries.
    if (visible() && !(state === 'paused' && pausedBecause === 'outdated')) { recheckWho(); void syncNow(); }
    timer = setTimeout(tick, pollMs);
  };

  function start() {
    if (started) return;
    started = true;
    // Finish what an earlier session left unsent, then pull.
    outbox.paths().forEach(path => { void exclusive(() => flushPath(path, () => {})).catch(() => undefined); });
    void syncNow();
    if (pollMs > 0) timer = setTimeout(tick, pollMs);
    unwake = options.onWake?.(() => { recheckWho(); wake(); void syncNow(); }) ?? null;
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
    /** Sends a set-aside write again, as it was written. Refused for a path that has an unsent newer document, so an old
     *  write can never replace a newer one. If the server refuses it again it comes back with the new reason. */
    retry(id: string): Promise<'sent' | 'refused' | 'busy' | 'gone'> {
      const all = outbox.quarantined();
      const at = all.findIndex(e => e.id === id);
      if (at < 0) return Promise.resolve('gone');
      const entry = all[at]!;
      if (outbox.has(entry.path) || all.slice(at + 1).some(e => e.path === entry.path)) return Promise.resolve('busy');
      // Try again adds, it never takes away. The set-aside copy is old: sent as it is, it would delete whatever was added since and
      // put back older versions of what was edited since. So a week is merged three-way with the row it was made from (ADR 031),
      // and for anything else the rows that changed on the server since the refusal, or that the old copy lacks, are left alone.
      // An entry from before versions were kept (no `seen`) only adds.
      const kind = parsePath(entry.path);
      const seen = entry.seen && typeof entry.seen === 'object' ? entry.seen : null;
      let doc = entry.doc;
      let retryRows = new Set<string>();
      if (kind && (kind.kind === 'weeks' || kind.kind === 'stretchweeks') && !isDeleted(doc)) {
        const cur = weekRow(entry.path);
        if (cur && (!seen || seen[mirrorId(kind.kind === 'weeks' ? 'weeks' : 'stretch_weeks', kind.weekStart)] !== cur.version)) {
          const m = kind.kind === 'weeks' ? mergeWeek3(entry.baseWeek ?? null, doc, cur.week) : mergeStretchWeek3(entry.baseWeek ?? null, doc, cur.week);
          doc = m.week;
          if (m.tookTheirs) note(entry.path, 'Sent what was set aside, merged with newer changes from another device.');
        }
      } else if (kind) {
        const desired = isDeleted(doc) ? [] : desiredRows(kind, doc, mirror.rows());
        const wantedRow = new Map(desired.map(r => [mirrorId(r.table, r.key), r]));
        const keep = new Set<string>();
        let newer = false; // only said when it is known: a version that moved since the refusal, or (no `seen`) a row the copy does not match
        for (const r of scopeRows(kind, mirror.rows())) {
          if (r.deleted) continue;
          const id = mirrorId(r.table, r.key);
          const want = wantedRow.get(id);
          const changed = seen ? seen[id] !== r.version : !want || canonOf(want) !== canonOf(r);
          if (changed) newer = true;
          if (changed || (!want && !isDeleted(doc))) keep.add(id);
        }
        if (newer) note(entry.path, seen ? 'Sent what was set aside; what changed on another device since was kept.' : 'Sent what was set aside; what the server had that differed from it was kept.');
        retryRows = keep;
      }
      const sending = set(entry.path, doc); // kept in the outbox before anything else happens
      // Tied to the copy now in the outbox (set() stores a clone). The send plans after an await, so this is in place by then.
      if (retryRows.size) retryKeep.set(entry.path, { doc: outbox.get(entry.path), rows: retryRows });
      outbox.discard(id); // only now is the old entry safe to drop
      announce();
      return sending.then(() => 'sent' as const, () => 'refused' as const);
    },
    /** Every document this device holds, unsent changes included, for the file the user can keep before wiping the device. */
    deviceData(): { path: string; doc: unknown }[] {
      const paths = new Set<string>(outbox.paths());
      for (const row of mirror.rows().values()) if (!row.deleted) pathsOf(row).forEach(p => paths.add(p));
      return [...paths].sort().map(path => ({ path, doc: localDoc(path) })).filter(d => d.doc != null);
    },
    /** The user chose to let go of what this device holds and carry on as the account now signed in. Everything of the old
     *  account is forgotten here (it stays on the server); the app must reload afterwards, since it still holds it in memory. */
    async wipeForNewAccount(): Promise<'done' | 'unavailable'> {
      // Not queued behind the sends: a send waiting for this very choice holds the queue. It sends nothing while blocked, so
      // nothing is in flight, and waking it afterwards finds its document gone.
      if (state !== 'paused' || pausedBecause !== 'account') return 'unavailable';
      const who = options.identity ? await options.identity() : null;
      if (who?.status !== 'signed-in') return 'unavailable';
      mirror.clear();
      outbox.clear();
      bases.clear(); retryKeep.clear(); // a week saved before the reload must not merge against the old data
      notices = [];
      adopt(who.userId);
      options.onOwnerChange?.();
      wake();
      announce();
      return 'done';
    },
    /** The one-time upload of what this browser held before accounts (Phase E, legacy.ts): all of `commands` or none. Only for an
     *  account the server has nothing for and a device with nothing waiting, so it cannot meet a real edit. Afterwards the rows
     *  are pulled like any others. A failure changes nothing, here or on the server. */
    async importLegacy(commands: readonly PlannedCommand[]): Promise<ImportOutcome | { ok: false; class: 'unavailable' | 'mismatch' }> {
      if (!transport.importLegacy) return { ok: false, class: 'unavailable' };
      const out = await exclusive(async () => {
        const allowed = await gate();
        if (!allowed.ok) { setState('paused', allowed.because); if (allowed.because === 'account') return { ok: false as const, class: 'unavailable' as const };
          return { ok: false as const, class: allowed.because, status: 0, retryAfterMs: null, message: 'not signed in, or the server could not be reached' }; }
        // This device must hold nothing of its own: anything pulled or unsent means the account is not the empty one the upload needs.
        if (hasData()) return { ok: false as const, class: 'not-empty' as const };
        const sent = await transport.importLegacy!(commands);
        if (!sent.ok) { if (sent.class === 'network' || sent.class === 'server' || sent.class === 'auth' || sent.class === 'outdated') setState('paused', sent.class); return sent; }
        const want: Record<string, number> = {};
        for (const c of commands) want[c.name] = (want[c.name] ?? 0) + 1;
        const same = sent.total === commands.length && Object.keys(want).length === Object.keys(sent.imported).length && Object.entries(want).every(([k, n]) => sent.imported[k] === n);
        return same ? sent : { ok: false as const, class: 'mismatch' as const };
      });
      if (out.ok || out.class === 'mismatch') await syncNow(); // bring the uploaded rows in, like any other change from the server
      return out;
    },
    /** The user chose to erase everything in their account (Phase F), or to delete the account: the server removes it for good, then this
     *  device forgets its copy, unsent changes included. Not queued behind the sends (one may be waiting on a server that is down): sending
     *  stops first, so nothing can put a row back. If the server does not do it, nothing local changes and sending carries on. The app
     *  must reload afterwards, since it still holds the data in memory. */
    async eraseEverything(what: 'data' | 'account'): Promise<AccountActionOutcome | { ok: false; class: 'unavailable' }> {
      const act = what === 'data' ? transport.eraseData : transport.deleteAccount;
      if (!act) return { ok: false, class: 'unavailable' };
      halted = true;
      wake(); // anything waiting to retry looks again, sees the halt and lets go
      await chain; // a send already on its way finishes before the server erases, so it cannot land after
      const out = await act();
      if (!out.ok) {
        // The halt made every waiting send let go, so start them again, as start() does; else they wait for a reload.
        halted = false;
        outbox.paths().forEach(path => { void exclusive(() => flushPath(path, () => {})).catch(() => undefined); });
        return out;
      }
      mirror.clear();
      outbox.clear();
      bases.clear(); retryKeep.clear();
      notices = [];
      storage.remove(OWNER_KEY);
      emitAll();
      announce();
      return out;
    },
    /** The user has seen these. */
    clearNotices: () => { notices = []; announce(); },
    /** Only the user lets a refused write go. */
    discard: (id: string) => { const ok = outbox.discard(id); if (ok) announce(); return ok; },
  };
}

export type ApiDb = ReturnType<typeof createApiDb>;
