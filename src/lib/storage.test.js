import { describe, it, expect, vi } from 'vitest';
import { makeSaveQueue } from './storage.js';

describe('save queue', () => {
  it('a permanent error drops only the failed write; a newer one queued meanwhile is still saved', async () => {
    vi.useFakeTimers();
    const writes = []; let first = true;
    const db = { doc: () => ({ set: async body => { if (first) { first = false; throw { code: 'invalid_argument' }; } writes.push(body); } }) };
    const flags = []; const q = makeSaveQueue({ getDb: () => db, onFlag: f => flags.push(f) });
    q.save('weeks/x', { v: 1 });
    await Promise.resolve();
    q.save('weeks/x', { v: 2 }); // arrives during the retry wait
    await vi.runAllTimersAsync();
    expect(writes).toEqual([{ v: 2 }]);
    expect(flags).toContain('Could not save');
    vi.useRealTimers();
  });
});
