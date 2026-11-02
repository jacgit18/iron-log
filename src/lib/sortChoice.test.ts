import { describe, it, expect } from 'vitest';
import { readSortChoice, writeSortChoice } from './sortChoice.js';

const OPTS = [{ key: 'name', label: 'Name A to Z' }, { key: 'used', label: 'Most used' }] as const;
const mem = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };
const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };

describe('sort choice storage', () => {
  it('gives the default when nothing is stored', () => expect(readSortChoice('ex', OPTS, 'name', mem())).toBe('name'));
  it('round-trips a non-default choice, per list', () => {
    const s = mem();
    writeSortChoice('ex', 'used', 'name', s);
    expect(readSortChoice('ex', OPTS, 'name', s)).toBe('used');
    expect(readSortChoice('other', OPTS, 'name', s)).toBe('name');
  });
  it('stores nothing for the default', () => {
    const s = mem();
    writeSortChoice('ex', 'used', 'name', s); writeSortChoice('ex', 'name', 'name', s);
    expect(s.m.size).toBe(0);
  });
  it('ignores a stored value that is not an option', () => {
    const s = mem(); s.setItem('ironlog:sort:ex', 'gone');
    expect(readSortChoice('ex', OPTS, 'name', s)).toBe('name');
  });
  it('never throws when storage is blocked', () => {
    expect(readSortChoice('ex', OPTS, 'name', broken)).toBe('name');
    expect(() => writeSortChoice('ex', 'used', 'name', broken)).not.toThrow();
  });
});
