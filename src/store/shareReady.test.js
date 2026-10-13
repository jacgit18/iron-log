import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import '../test/browserStubs.js';

// The first tap's permission ran out ('blocked'): the built file waits for a second tap, but only for a minute. After that it
// is a stale snapshot, so the person gets the normal Share button again and a later tap builds a fresh file.
vi.mock('../lib/share.js', async importOriginal => ({ ...(await importOriginal()), shareFile: vi.fn(async () => 'blocked') }));

let useAppStore, SHARE_READY_MS;
beforeAll(async () => { ({ useAppStore, SHARE_READY_MS } = await import('./useAppStore.js')); });
beforeEach(() => {
  vi.useFakeTimers();
  useAppStore.setState({ dl: { save: vi.fn() }, exporting: null, shareReady: null, buildExportFile: async () => ({ filename: 'iron-log-data-2026-10-13.json', data: '{}' }) });
});
afterEach(() => { vi.useRealTimers(); });

describe('a built export waiting for a second tap', () => {
  it('is kept while the person can still tap, then dropped', async () => {
    await useAppStore.getState().shareExport('data');
    expect(useAppStore.getState().shareReady?.file.name).toBe('iron-log-data-2026-10-13.json');
    vi.advanceTimersByTime(SHARE_READY_MS - 1000);
    expect(useAppStore.getState().shareReady).not.toBeNull();
    vi.advanceTimersByTime(1000);
    expect(useAppStore.getState().shareReady).toBeNull();
  });
  it('a newer waiting file is not dropped by an older one\'s timer', async () => {
    await useAppStore.getState().shareExport('data');
    vi.advanceTimersByTime(SHARE_READY_MS - 5000);
    await useAppStore.getState().shareExport('data'); // a new first tap builds a new file
    const second = useAppStore.getState().shareReady;
    vi.advanceTimersByTime(5000); // the first file's timer fires now
    expect(useAppStore.getState().shareReady).toBe(second);
  });
});

describe('a failed export', () => {
  it('a CSV that fails to save leaves every export available', async () => {
    useAppStore.setState({ dl: { save: vi.fn(async () => { throw new Error('disk full'); }) } });
    await useAppStore.getState().exportCsv();
    expect(useAppStore.getState().dl).not.toBeNull();
    expect(useAppStore.getState().exporting).toBeNull();
  });
});
