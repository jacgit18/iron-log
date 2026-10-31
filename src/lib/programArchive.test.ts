import { describe, expect, it } from 'vitest';
import { archivedHeading, splitLibrary } from './programArchive.js';
import { moveTargets } from './programMove.js';
import { normLibrary } from '../shared/validate.js';
import { BUILTIN } from './data.js';
import type { Cfg, LibraryItem } from '../types.ts';

const prog = { days: [] } as any;
const item = (id: string, at: string, archived?: true): LibraryItem => ({ id, name: id, at, prog, ...(archived ? { archived } : {}) });

describe('splitLibrary', () => {
  it('separates archived from active, newest first', () => {
    const { active, archived } = splitLibrary([item('a', '2026-01-01'), item('b', '2026-03-01', true), item('c', '2026-02-01'), item('d', '2026-04-01', true)]);
    expect(active.map(x => x.id)).toEqual(['c', 'a']);
    expect(archived.map(x => x.id)).toEqual(['d', 'b']);
  });
  it('does not change the list it is given', () => {
    const lib = [item('a', '1'), item('b', '2')]; splitLibrary(lib);
    expect(lib.map(x => x.id)).toEqual(['a', 'b']);
  });
  it('words the heading with the count', () => expect(archivedHeading(3)).toBe('Archived (3)'));
});

describe('moveTargets', () => {
  it('leaves archived programs out and A and B in', () => {
    const t = moveTargets({ progNames: {} } as unknown as Cfg, [item('x', '1'), item('y', '2', true)]);
    expect(t.map(x => x.key)).toEqual(['A', 'B', 'L:x']);
  });
});

describe('normLibrary archived flag', () => {
  const raw = (archived: unknown) => ({ id: 'abcd1234', name: 'P', at: '2026-01-01', archived, prog: structuredClone(BUILTIN.A) });
  it('keeps archived: true', () => expect(normLibrary([raw(true)])[0]?.archived).toBe(true));
  it('drops any other value', () => { expect(normLibrary([raw('yes')])[0]).toBeDefined(); expect(normLibrary([raw('yes')])[0]?.archived).toBeUndefined(); expect(normLibrary([raw(false)])[0]?.archived).toBeUndefined(); });
});
