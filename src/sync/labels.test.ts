import { describe, expect, it } from 'vitest';
import type { SyncStatus } from './apiDb.js';
import { describeSync, formatWhen, pathLabel, storageWarning, versionLabel } from './labels.js';

const status = (over: Partial<SyncStatus> = {}): SyncStatus => ({
  state: 'idle', pausedBecause: null, pendingPaths: [], quarantined: 0, quarantine: [], lastPullAt: null, lastSyncedAt: null, persisted: true, ready: true, notices: [], ...over,
});
const clock = (ms: number) => `t${ms}`;

describe('describeSync', () => {
  it('synced, with the time of the last sync when it is known', () => {
    expect(describeSync(status(), clock)).toEqual({ headline: 'Synced', detail: '', tone: 'ok', canSyncNow: true });
    expect(describeSync(status({ lastSyncedAt: 5 }), clock).detail).toBe('Last synced t5.');
  });

  it('syncing, and what is being sent', () => {
    expect(describeSync(status({ state: 'syncing' }), clock)).toMatchObject({ headline: 'Syncing…', tone: 'busy', canSyncNow: false });
    expect(describeSync(status({ state: 'syncing', pendingPaths: ['a', 'b'] }), clock).detail).toBe('2 changes are being sent.');
    expect(describeSync(status({ state: 'syncing', pendingPaths: ['a'] }), clock).detail).toBe('A change is being sent.');
  });

  it('before the first pull it says it is loading, and does not offer to sync', () => {
    expect(describeSync(status({ ready: false, state: 'starting' }), clock)).toMatchObject({ headline: 'Loading your data from the server…', tone: 'busy', canSyncNow: false });
  });

  it('offline: says the changes are safe and will be sent', () => {
    const d = describeSync(status({ state: 'paused', pausedBecause: 'network', pendingPaths: ['logs/squat', 'weeks/2026-10-04', 'body/main'], lastSyncedAt: 9 }), clock);
    expect(d).toMatchObject({ headline: 'Offline', tone: 'wait', canSyncNow: true });
    expect(d.detail).toBe('3 changes are saved on this device and will be sent when the connection returns. Last synced t9.');
  });

  it('offline with nothing waiting does not talk about changes', () => {
    expect(describeSync(status({ state: 'paused', pausedBecause: 'network' }), clock).detail).toBe('Nothing is lost.');
  });

  it('the server not answering', () => {
    const d = describeSync(status({ state: 'paused', pausedBecause: 'server', pendingPaths: ['logs/squat'] }), clock);
    expect(d.headline).toBe('The server is not answering');
    expect(d.detail).toContain('A change is saved on this device and will be sent when it does. It will keep trying.');
    expect(d.tone).toBe('wait');
  });

  it('sign-in needed is a problem for the user to fix', () => {
    expect(describeSync(status({ state: 'paused', pausedBecause: 'auth', pendingPaths: ['a'] }), clock)).toMatchObject({ headline: 'Sign-in needed', tone: 'bad' });
  });

  it('too old to sync says the changes are kept, with or without anything waiting', () => {
    const waiting = describeSync(status({ state: 'paused', pausedBecause: 'outdated', pendingPaths: ['a', 'b'] }), clock);
    expect(waiting).toMatchObject({ headline: 'Update needed', tone: 'bad' });
    expect(waiting.detail).toContain('2 changes are saved on this device and will be sent once you update.');
    expect(describeSync(status({ state: 'paused', pausedBecause: 'outdated' }), clock).detail).toContain('Your changes are kept on this device and will be sent once you update.');
  });

  it('idle with something waiting says it will be sent shortly', () => {
    expect(describeSync(status({ pendingPaths: ['a'] }), clock)).toMatchObject({ headline: 'Waiting to send', tone: 'wait' });
  });

  it('a pause beats "not ready": the reason is what the user needs', () => {
    expect(describeSync(status({ ready: false, state: 'paused', pausedBecause: 'network' }), clock).headline).toBe('Offline');
  });

  it('every state has a headline in words, so nothing depends on colour', () => {
    const states: Partial<SyncStatus>[] = [{}, { state: 'syncing' }, { ready: false }, { pendingPaths: ['a'] }, ...(['network', 'server', 'auth', 'outdated'] as const).map(p => ({ state: 'paused' as const, pausedBecause: p }))];
    for (const over of states) expect(describeSync(status(over), clock).headline.length).toBeGreaterThan(3);
  });
});

describe('storageWarning', () => {
  it('is empty when all is well and a clear warning when the browser refused to keep something', () => {
    expect(storageWarning(status())).toBe('');
    expect(storageWarning(status({ persisted: false }))).toMatch(/out of space.*lost if you reload/);
  });
});

describe('pathLabel', () => {
  const nameOf = (id: string) => ({ squat: 'Back squat' })[id as 'squat'] ?? id;
  it.each([
    ['logs/squat', 'Back squat log'],
    ['logs/unknown-thing', 'unknown-thing log'],
    ['weeks/2026-10-04', 'Week of Oct 4'],
    ['stretchweeks/2026-10-04', 'Stretches, week of Oct 4'],
    ['programs/A', 'Program A'],
    ['body/main', 'Body weight'],
    ['library/main', 'Saved programs'],
    ['experiments/main', 'Exercises to try'],
    ['stretches/main', 'Stretch list'],
    ['supplements/main', 'Supplements and water'],
    ['config/main', 'Settings'],
    ['something/else', 'something/else'],
  ])('%s is called %s', (path, label) => {
    expect(pathLabel(path, nameOf)).toBe(label);
  });
});

describe('formatWhen and versionLabel', () => {
  it('formatWhen gives a short date and time, and nothing for a date it cannot read', () => {
    expect(formatWhen('2026-10-08T14:35:00.000Z')).toMatch(/^Oct \d{1,2}, \d{1,2}:\d{2} (AM|PM)$/);
    expect(formatWhen('not a date')).toBe('');
  });
  it('versionLabel shows the build date and the number, or says it is a development build', () => {
    expect(versionLabel('1791432911')).toMatch(/^Oct \d{1,2}, 2026, \d{1,2}:\d{2} (AM|PM) \(1791432911\)$/);
    expect(versionLabel('dev')).toBe('development build');
    expect(versionLabel('')).toBe('development build');
  });
});
