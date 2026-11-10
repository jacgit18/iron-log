import { describe, expect, it } from 'vitest';
import type { SupplementItem } from '../types.ts';
import { planAddMine } from './supplementAddPlan.js';

const items: SupplementItem[] = [
  { id: 'fish-am', n: 'Fish Oil', slot: 'morning' },
  { id: 'zinc', n: 'Zinc', slot: '' },
];

describe('planAddMine', () => {
  it('moves a library-only supplement into the time of day', () => expect(planAddMine(items, 'zinc', 'night')).toEqual({ kind: 'move', id: 'zinc' }));
  it('adds another instance of one that is scheduled elsewhere', () => expect(planAddMine(items, 'fish-am', 'night')).toEqual({ kind: 'instance', id: 'fish-am' }));
  it('leaves one alone that is already in that time of day, or when only the library is chosen', () => {
    expect(planAddMine(items, 'fish-am', 'morning')).toMatchObject({ kind: 'exists', message: 'Fish Oil is already in Morning.' });
    expect(planAddMine(items, 'zinc', '')).toMatchObject({ kind: 'exists' });
  });
  it('moves the library-only copy when another instance is scheduled', () => {
    const two: SupplementItem[] = [...items, { id: 'fish-lib', n: 'fish oil', slot: '' }];
    expect(planAddMine(two, 'fish-am', 'noon')).toEqual({ kind: 'move', id: 'fish-lib' });
  });
  it('gives nothing for an unknown id', () => expect(planAddMine(items, 'nope', 'night')).toBeNull());
});
