import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { AREAS } from './coverage-areas.mjs';
import { CAPS, capArea, overCap, underCap, unloadedFiles } from './coverage-report.mjs';

const empty = { statements: { total: 0 } };
const some = { statements: { total: 10 } };

describe('unloadedFiles', () => {
  it('lists source files with no statements counted, not loaded ones, type-only files or non-source files', () => {
    const entries = [['src/lib/a.ts', empty], ['src/lib/b.ts', some], ['src/store/types.ts', empty], ['src/styles.css', empty], ['src/components/C.tsx', empty]];
    expect(unloadedFiles(entries)).toEqual(['src/lib/a.ts', 'src/components/C.tsx']);
  });
});

describe('unloadedFiles skip list', () => {
  it('leaves out a file listed as holding only types or re-exports', () => {
    const entries = [['src/store/barrel.ts', empty], ['src/store/slice.ts', empty]];
    expect(unloadedFiles(entries, ['src/store/barrel.ts'])).toEqual(['src/store/slice.ts']);
  });
});

describe('areas', () => {
  it('gives every area an integer cap, so no area has a floor without a cap', () => {
    for (const [name, a] of Object.entries(AREAS)) expect(Number.isInteger(a.cap), name).toBe(true);
    expect(Object.keys(CAPS)).toEqual(Object.keys(AREAS));
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

describe('underCap', () => {
  const full = area => Array.from({ length: CAPS[area] }, (_, i) => `${area}/x${i}.ts`);
  it('flags an area whose unloaded files dropped below its cap, so the cap gets lowered', () => {
    const files = full('src/lib').slice(1);
    expect(underCap(files).find(u => u.area === 'src/lib')).toEqual({ area: 'src/lib', cap: CAPS['src/lib'], count: CAPS['src/lib'] - 1 });
  });
  it('does not flag an area exactly at its cap, and counts a missing area as zero', () => {
    expect(underCap(full('src/lib')).some(u => u.area === 'src/lib')).toBe(false);
    expect(underCap([]).map(u => u.area).sort()).toEqual(Object.keys(CAPS).filter(k => CAPS[k] > 0).sort());
  });
});

describe('--check as a command', () => {
  const script = join(dirname(fileURLToPath(import.meta.url)), 'coverage-report.mjs');
  let dir;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));
  const project = unloaded => {
    dir = realpathSync(mkdtempSync(join(tmpdir(), 'cov-')));
    mkdirSync(join(dir, 'coverage'));
    const empty = { statements: { total: 0, covered: 0 }, branches: { total: 0, covered: 0 } };
    writeFileSync(join(dir, 'coverage/coverage-summary.json'), JSON.stringify(Object.fromEntries(unloaded.map(f => [join(dir, f), empty]))));
    return dir;
  };
  const atCaps = () => Object.entries(CAPS).flatMap(([area, n]) => Array.from({ length: n }, (_, i) => `${area}/x${i}.ts`));
  const run = (cwd, path = script) => spawnSync(process.execPath, [path, '--check'], { cwd, encoding: 'utf8' });

  it('exits 0 when every area is exactly at its cap', () => {
    const r = run(project(atCaps()));
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('caps hold');
  });
  it('exits 1 and names the area when a new file has no test', () => {
    const r = run(project([...atCaps(), 'src/store/newSlice.ts']));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('src/store: 1 files no test loads, cap is 0');
  });
  it('exits 1 when tests now load files the cap still allows', () => {
    const r = run(project(atCaps().slice(1)));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Lower the cap');
  });
  it('still runs when started through a symlinked directory (it must not pass without checking)', () => {
    const cwd = project([...atCaps(), 'src/store/newSlice.ts']);
    symlinkSync(dirname(script), join(cwd, 'linked'));
    const r = run(cwd, join(cwd, 'linked', 'coverage-report.mjs'));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('src/store');
  });
});
