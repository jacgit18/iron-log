import { fmtShort, parseDate } from '../shared/dates.js';
import type { SyncStatus } from './apiDb.js';
import type { QuarantineEntry } from './outbox.js';

/* ---------- Words for the sync screen ----------
   Plain-language text for what sync is doing, kept apart from the screen so it can be tested without a browser. A status is
   never shown by colour alone: every state has a headline in words, and `tone` only picks how loudly it is drawn. */

export type Tone = 'ok' | 'busy' | 'wait' | 'bad';

export interface Description {
  headline: string;
  detail: string;
  tone: Tone;
  /** True when "Sync now" makes sense (not while it is already working). */
  canSyncNow: boolean;
}

/** A time of day, like "2:32 PM". */
export const formatClock = (ms: number) => new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/** A date and time, like "Oct 8, 2:35 PM". */
export const formatWhen = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${fmtShort(d)}, ${formatClock(d.getTime())}`;
};

const changes = (n: number) => (n === 1 ? 'A change is' : `${n} changes are`);

/** What sync is doing, in words. `clock` is injectable so tests do not depend on the machine's time zone. */
export function describeSync(s: SyncStatus, clock: (ms: number) => string = formatClock): Description {
  const waiting = s.pendingPaths.length;
  const kept = waiting ? `${changes(waiting)} saved on this device` : 'Nothing is lost';
  const last = s.lastSyncedAt ? ` Last synced ${clock(s.lastSyncedAt)}.` : '';
  if (s.state === 'paused') {
    switch (s.pausedBecause) {
      case 'outdated':
        return { headline: 'Update needed', detail: `This version of Iron Log is too old to sync. ${waiting ? `${kept} and will be sent` : 'Your changes are kept on this device and will be sent'} once you update.`, tone: 'bad', canSyncNow: true };
      case 'auth':
        return { headline: 'Sign-in needed', detail: `${kept}${waiting ? ' and will be sent' : ''} once you are signed in.${last}`, tone: 'bad', canSyncNow: true };
      case 'account':
        return { headline: 'Another account', detail: `This device holds data from a different account, so nothing has been sent or received. ${waiting ? `${kept} and stays here until you choose below.` : 'Choose below what to do with it.'}`, tone: 'bad', canSyncNow: true };
      case 'network':
        return { headline: 'Offline', detail: `${kept}${waiting ? ' and will be sent when the connection returns' : ''}.${last}`, tone: 'wait', canSyncNow: true };
      default:
        return { headline: 'The server is not answering', detail: `${kept}${waiting ? ' and will be sent when it does' : ''}. It will keep trying.${last}`, tone: 'wait', canSyncNow: true };
    }
  }
  if (!s.ready) return { headline: 'Loading your data from the server…', detail: 'Your data shows once it has loaded.', tone: 'busy', canSyncNow: false };
  if (s.state === 'syncing') return { headline: 'Syncing…', detail: waiting ? `${changes(waiting)} being sent.` : '', tone: 'busy', canSyncNow: false };
  if (waiting) return { headline: 'Waiting to send', detail: `${changes(waiting)} saved on this device and will be sent shortly.`, tone: 'wait', canSyncNow: true };
  return { headline: 'Synced', detail: s.lastSyncedAt ? `Last synced ${clock(s.lastSyncedAt)}.` : '', tone: 'ok', canSyncNow: true };
}

/** A warning when the browser has refused to keep something, so a reload would lose it. Empty when all is well. */
export const storageWarning = (s: SyncStatus) =>
  s.persisted ? '' : 'This device is out of space, so some changes are held in memory only and would be lost if you reload. Download your data or free some space.';

const weekOf = (key: string) => fmtShort(parseDate(key));

/** What a document path is called to the user. `nameOf` turns an exercise id into its name. */
export function pathLabel(path: string, nameOf: (id: string) => string = id => id): string {
  const [head, rest = ''] = path.split('/');
  switch (head) {
    case 'logs': return `${nameOf(rest)} log`;
    case 'weeks': return `Week of ${weekOf(rest)}`;
    case 'stretchweeks': return `Stretches, week of ${weekOf(rest)}`;
    case 'programs': return `Program ${rest}`;
    case 'body': return 'Body weight';
    case 'library': return 'Saved programs';
    case 'experiments': return 'Exercises to try';
    case 'stretches': return 'Stretch list';
    case 'supplements': return 'Supplements and water';
    case 'config': return 'Settings';
    default: return path;
  }
}

/** The build's version as the user would read it: "Oct 7, 2026, 2:35 PM (1791432911)", or "development build". */
export function versionLabel(version: string): string {
  if (!/^\d{1,12}$/.test(version)) return 'development build';
  const d = new Date(Number(version) * 1000);
  return `${fmtShort(d)}, ${d.getFullYear()}, ${formatClock(d.getTime())} (${version})`;
}

/** Everything this device holds (what it has from the server and what it has not sent), so nothing is trapped on it before it is
 *  wiped for another account. Each document is whole; `notSent` lists what the server had refused. */
export function deviceDataFile(items: readonly { path: string; doc: unknown }[], notSent: readonly QuarantineEntry[], nameOf: (id: string) => string, version: string, now: Date = new Date()): string {
  return JSON.stringify({
    app: 'Iron Log',
    kind: 'everything this device held',
    version,
    savedAt: now.toISOString(),
    items: items.map(i => ({ what: pathLabel(i.path, nameOf), path: i.path, document: i.doc })),
    notSent: notSent.map(e => ({ what: pathLabel(e.path, nameOf), path: e.path, reason: e.reason, setAside: e.at, document: e.doc })),
  }, null, 1);
}

/** The file the user downloads for writes the server would not take: what each was, why, and the document itself, so
 *  nothing is trapped on the device. */
export function notSentFile(entries: readonly QuarantineEntry[], nameOf: (id: string) => string, version: string, now: Date = new Date()): string {
  return JSON.stringify({
    app: 'Iron Log',
    kind: 'changes the server would not take',
    version,
    savedAt: now.toISOString(),
    items: entries.map(e => ({ what: pathLabel(e.path, nameOf), path: e.path, reason: e.reason, setAside: e.at, document: e.doc })),
  }, null, 1);
}

/** Why the one-time upload did not happen, in words. It is all or nothing, so every answer says nothing was uploaded. */
export function importFailure(out: { class: string; reason?: string; at?: number | null; command?: string | null }): string {
  switch (out.class) {
    case 'refused': return `The server would not take row ${(out.at ?? 0) + 1}${out.command ? ` (${out.command})` : ''}: ${out.reason ?? 'refused'}. Nothing was uploaded.`;
    case 'network': case 'server': case 'auth': case 'outdated': return 'Could not reach the server, or you are signed out. Nothing was uploaded; try again in a moment.';
    case 'not-empty': return 'Your account already has data, so nothing was uploaded.';
    case 'mismatch': return 'The server’s counts did not match what was sent, so please check your data before trying again.';
    default: return 'Uploading is not available right now. Nothing was uploaded.';
  }
}
