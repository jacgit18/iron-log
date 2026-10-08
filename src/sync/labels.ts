import { fmtShort, parseDate } from '../shared/dates.js';
import type { SyncStatus } from './apiDb.js';

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
