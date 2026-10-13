import { describe, it, expect, beforeAll, vi } from 'vitest';
import '../test/browserStubs.js';

let useAppStore;
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); });

describe('a failed export', () => {
  it('a CSV that fails to save leaves every export available', async () => {
    useAppStore.setState({ exporting: null, dl: { save: vi.fn(async () => { throw new Error('disk full'); }) } });
    await useAppStore.getState().exportCsv();
    expect(useAppStore.getState().dl).not.toBeNull();
    expect(useAppStore.getState().exporting).toBeNull();
  });
});
