import { describe, expect, it } from 'vitest';
import type { SyncStatus } from '../sync/apiDb.js';
import { problemDetails } from './problemDetails.js';

const base = { version: '1790000000', online: true, userAgent: 'UA/1.0', standalone: false, now: new Date('2026-10-14T12:00:00Z') };
const sync = (over: Partial<SyncStatus> = {}): SyncStatus => ({ state: 'idle', pausedBecause: null, pendingPaths: [], quarantined: 0, quarantine: [], lastPullAt: null, lastSyncedAt: null, persisted: true, ready: true, holdsData: true, notices: [], ...over });

describe('problemDetails', () => {
  it('says syncing is off when there is no sync status', () => {
    const t = problemDetails({ ...base, sync: null });
    expect(t).toContain('Sync: off (this device only)');
    expect(t).toContain('App build: ');
    expect(t).toContain('Network: online');
    expect(t).toContain('Time: 2026-10-14T12:00:00.000Z');
  });

  it('counts what is waiting and not sent, and why sync is paused, without naming any document', () => {
    const t = problemDetails({ ...base, online: false, sync: sync({ state: 'paused', pausedBecause: 'network', pendingPaths: ['weeks/2026-10-11', 'config/main'], quarantined: 1, persisted: false }) });
    expect(t).toContain('paused, network');
    expect(t).toContain('2 waiting to send, 1 not sent, browser refused a save');
    expect(t).toContain('Network: offline');
    expect(t).not.toContain('weeks/2026');
  });

  it('keeps a long browser string short', () => {
    expect(problemDetails({ ...base, sync: null, userAgent: 'x'.repeat(500) }).length).toBeLessThan(500);
  });
});
