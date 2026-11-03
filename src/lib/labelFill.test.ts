import { describe, expect, it } from 'vitest';
import { planFill } from './labelFill.js';
import { SCAN_TEXT } from './scanPhoto.js';

const label = { kind: 'ok' as const, label: { name: 'Gnocchi', serving: '1 cup', servingG: 140, servingsPerPack: 3, kcal: 210, p: 6, c: 40 } };

describe('planFill', () => {
  it('replaces the numbers and fills an empty name and note', () => {
    expect(planFill(label, { n: '', note: '' })).toEqual({ n: 'Gnocchi', kcal: '210', p: '6', c: '40', f: '', note: '1 serving = 1 cup (140 g). About 3 servings per pack.', message: 'Filled from the photo. Check the numbers against the label, then save.' });
  });
  it('keeps a name and a note that are already typed', () => {
    const p = planFill(label, { n: 'My gnocchi', note: 'bought at BJ\'s' });
    expect(p.n).toBeUndefined();
    expect(p.note).toBeUndefined();
    expect(p.kcal).toBe('210');
  });
  it('changes no number for an unreadable or per-100 g label, and may offer the name', () => {
    expect(planFill({ kind: 'unreadable' }, { n: '', note: '' })).toEqual({ message: SCAN_TEXT.unreadable });
    expect(planFill({ kind: 'per100g', name: 'Rice' }, { n: '', note: '' })).toEqual({ n: 'Rice', message: SCAN_TEXT.per100g });
    expect(planFill({ kind: 'per100g', name: 'Rice' }, { n: 'Mine', note: '' })).toEqual({ message: SCAN_TEXT.per100g });
  });
});
