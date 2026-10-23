import { describe, expect, it } from 'vitest';
import { CAPS, capArea, overCap, unloadedFiles } from './coverage-report.mjs';

const empty = { statements: { total: 0 } };
const some = { statements: { total: 10 } };

describe('unloadedFiles', () => {
  it('lists source files with no statements counted, not loaded ones, type-only files or non-source files', () => {
    const entries = [['src/lib/a.ts', empty], ['src/lib/b.ts', some], ['src/store/types.ts', empty], ['src/styles.css', empty], ['src/components/C.tsx', empty]];
    expect(unloadedFiles(entries)).toEqual(['src/lib/a.ts', 'src/components/C.tsx']);
  });
});

describe('overCap', () => {
  it('passes when every capped area is at or under its cap', () => {
    const files = Array.from({ length: CAPS['src/lib'] }, (_, i) => `src/lib/x${i}.ts`);
    expect(overCap(files)).toEqual([]);
  });
  it('flags a capped area that grows by one file', () => {
    const files = Array.from({ length: CAPS['src/lib'] + 1 }, (_, i) => `src/lib/x${i}.ts`);
    expect(overCap(files)).toEqual([{ area: 'src/lib', cap: CAPS['src/lib'], count: CAPS['src/lib'] + 1 }]);
  });
  it('treats a new unloaded file in a zero-cap area (store, shared, server) as over', () => {
    expect(overCap(['src/store/newSlice.ts']).map(o => o.area)).toEqual(['src/store']);
    expect(overCap(['server/commands/newCommand.ts']).map(o => o.area)).toEqual(['server']);
  });
  it('does not cap components or other areas', () => {
    expect(overCap(['src/components/board/New.tsx', 'src/App.tsx'])).toEqual([]);
  });
  it('groups every server folder under one cap', () => {
    expect(capArea('server/push/send.ts')).toBe('server');
    expect(capArea('server/index.ts')).toBe('server');
  });
});
