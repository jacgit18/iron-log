import { describe, expect, it } from 'vitest';
import { findBareSorts } from './check-sorts.mjs';

describe('findBareSorts', () => {
  it('flags a bare localeCompare inside a sort', () => {
    expect(findBareSorts('list.sort((a, b) => a.name.localeCompare(b.name));')).toHaveLength(1);
  });
  it('flags one that sits on a later line of a multi-line sort', () => {
    const src = 'list.sort((a, b) =>\n  a.x - b.x ||\n  a.name.localeCompare(b.name));';
    expect(findBareSorts(src)).toEqual([{ line: 3, text: 'a.name.localeCompare(b.name));' }]);
  });
  it('lets a sort-ok comment on the line or the line above through', () => {
    expect(findBareSorts('list.sort((a, b) => a.d.localeCompare(b.d)); // sort-ok: ISO date strings')).toEqual([]);
    expect(findBareSorts('// sort-ok: ISO date strings\nlist.sort((a, b) => a.d.localeCompare(b.d));')).toEqual([]);
  });
  it('lets a sort-ok line above exempt only the sort right under it', () => {
    const src = '// sort-ok: ISO date strings\na.sort((x, y) => x.d.localeCompare(y.d));\nb.sort((x, y) => x.n.localeCompare(y.n));';
    expect(findBareSorts(src)).toEqual([{ line: 3, text: 'b.sort((x, y) => x.n.localeCompare(y.n));' }]);
  });
  it('does not let a trailing sort-ok on one line cover a sort on the next line', () => {
    const src = 'a.sort((x, y) => x.d.localeCompare(y.d)); // sort-ok: ISO date strings\nb.sort((x, y) => x.n.localeCompare(y.n));';
    expect(findBareSorts(src)).toHaveLength(1);
  });
  it('does not see a comparator kept in a variable (known gap)', () => {
    expect(findBareSorts('const newest = (a, b) => a.d.localeCompare(b.d);\nlist.sort(newest);')).toEqual([]);
  });
  it('lets a compare with options through (already a deliberate case-insensitive compare)', () => {
    expect(findBareSorts("list.sort((a, b) => a.n.localeCompare(b.n, undefined, { sensitivity: 'base' }));")).toEqual([]);
  });
  it('ignores localeCompare outside a sort and sorts without it', () => {
    expect(findBareSorts('const same = a.localeCompare(b) === 0; list.sort((a, b) => a - b);')).toEqual([]);
    expect(findBareSorts('list.sort(nameCmp(x => x.name, x => x.id));')).toEqual([]);
  });
  it('is not fooled by a nested call with a comma', () => {
    expect(findBareSorts('list.sort((a, b) => f(a, 1).localeCompare(f(b, 2)));')).toHaveLength(1);
  });
});
