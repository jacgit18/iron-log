import type { SyncStatus } from '../sync/apiDb.js';
import { describeSync, versionLabel } from '../sync/labels.js';

/** What a person pastes into the feedback form so a bug can be traced: the app build, how syncing stands, and the browser.
 *  Counts and words only. Never an email, an exercise, a weight, a note or a document: nothing the person typed. */
export interface ProblemFacts {
  version: string;
  /** Null when syncing is off. */
  sync: SyncStatus | null;
  online: boolean;
  userAgent: string;
  standalone: boolean;
  now?: Date;
}

export function problemDetails({ version, sync, online, userAgent, standalone, now = new Date() }: ProblemFacts): string {
  const syncLine = sync
    ? `${describeSync(sync).headline} (${sync.state}${sync.pausedBecause ? `, ${sync.pausedBecause}` : ''}); ${sync.pendingPaths.length} waiting to send, ${sync.quarantined} not sent${sync.persisted ? '' : ', browser refused a save'}`
    : 'off (this device only)';
  return [
    'Loadbearer problem details',
    `App build: ${versionLabel(version)}`,
    `Sync: ${syncLine}`,
    `Network: ${online ? 'online' : 'offline'}`,
    `Installed app: ${standalone ? 'yes' : 'no (in the browser)'}`,
    `Browser: ${userAgent.slice(0, 200)}`,
    `Time: ${now.toISOString()}`,
  ].join('\n');
}
