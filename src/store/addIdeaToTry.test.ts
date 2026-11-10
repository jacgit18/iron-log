import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clearStorage, saved } from '../test/browserStubs.js';

// A shared video's exercise is put on the Ideas to try list (ShareSheet): addIdeaToTry adds it once, only for an exercise in the library.
let useAppStore: typeof import('./useAppStore.js').useAppStore; const st = () => useAppStore.getState();
beforeAll(async () => { ({ useAppStore } = await import('./useAppStore.js')); await st().init(); });
beforeEach(() => { clearStorage(); useAppStore.setState({ experiments: [] }); });

describe('addIdeaToTry', () => {
  it('lists a newly created exercise once and saves the list', () => {
    const id = st().createExercise({ nn: 'Cable Lateral Raise', nu: 'https://youtu.be/abc123' });
    expect(st().addIdeaToTry(id)).toBe(true);
    expect(st().experiments).toMatchObject([{ ex: id, ph: null, note: '' }]);
    expect((saved('experiments/main') as { items: unknown[] }).items).toHaveLength(1);
    expect(st().addIdeaToTry(id)).toBe(false); // already there: no second row
    expect(st().experiments).toHaveLength(1);
  });
  it('refuses an exercise that is not in the library', () => {
    expect(st().addIdeaToTry('no-such-exercise')).toBe(false);
    expect(st().experiments).toEqual([]);
  });
});
