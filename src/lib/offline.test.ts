import { describe, expect, it } from 'vitest';
import { offlineView } from './offline.js';

const base = { syncOn: true, online: true, wasOffline: false, pending: 0, syncing: false };

describe('offlineView', () => {
  it('says nothing while syncing is off, even offline: everything is local anyway', () => {
    expect(offlineView({ ...base, syncOn: false, online: false })).toBe('hidden');
  });
  it('says nothing while online and nothing was lost', () => {
    expect(offlineView(base)).toBe('hidden');
    expect(offlineView({ ...base, pending: 3 })).toBe('hidden'); // waiting for another reason (SyncNotice covers it)
  });
  it('shows the offline note whenever the device is offline, with or without waiting changes', () => {
    expect(offlineView({ ...base, online: false })).toBe('offline');
    expect(offlineView({ ...base, online: false, pending: 2, wasOffline: true })).toBe('offline');
  });
  it('after coming back it says syncing while changes are being sent, then clears itself', () => {
    expect(offlineView({ ...base, wasOffline: true, pending: 2, syncing: true })).toBe('reconnecting');
    expect(offlineView({ ...base, wasOffline: true, pending: 0, syncing: true })).toBe('hidden');
    expect(offlineView({ ...base, wasOffline: true, pending: 0 })).toBe('hidden');
  });
  it('does not claim to be syncing when the send is not running (the server keeps failing, or sync is paused)', () => {
    expect(offlineView({ ...base, wasOffline: true, pending: 2, syncing: false })).toBe('hidden');
  });
});
