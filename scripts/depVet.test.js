import { describe, expect, it } from 'vitest';
import { addedPackages, approvals, distance, judge, lookalikes, lookup } from './dep-vet.mjs';

const day = 86_400_000;
const now = Date.parse('2026-10-21T00:00:00Z');
const good = { created: '2019-01-01T00:00:00Z', weeklyDownloads: 5_000_000, scripts: {}, repository: { url: 'x' }, license: 'MIT' };

describe('distance and lookalikes', () => {
  it('counts edits and neighbour swaps', () => {
    expect(distance('react-datepicker', 'react-datepiicker')).toBe(1);
    expect(distance('lodash', 'lodahs')).toBe(1);
    expect(distance('abc', 'xyz')).toBe(3);
  });
  it('flags a near name of a popular package, not the package itself or an unrelated name', () => {
    expect(lookalikes('react-datepiicker')).toContain('react-datepicker');
    expect(lookalikes('lodash')).toEqual([]);
    expect(lookalikes('left-pad-thing')).toEqual([]);
  });
  it('does not compare @types/x with x, or a scoped name with an unscoped one', () => {
    expect(lookalikes('@types/react')).toEqual([]);
    expect(lookalikes('@playwright/test')).toEqual([]);
    expect(lookalikes('@types-react/core', ['@types/react'])).toEqual([]);
    expect(lookalikes('@acme/utils', ['@acme/utlis'])).toEqual(['@acme/utlis']);
  });
  it('flags a near name of a package already in the tree, and skips very short names', () => {
    expect(lookalikes('my-internal-utlis', ['my-internal-utils'])).toEqual(['my-internal-utils']);
    expect(lookalikes('ms', [])).toEqual([]);
  });
});

describe('judge', () => {
  it('passes an old, popular, linked package', () => expect(judge('left-pad-ish', good, [], now)).toEqual({ block: [], warn: [] }));
  it('blocks a name the registry does not know', () => expect(judge('nope', null, [], now).block).toHaveLength(1));
  it('blocks a brand-new package and one nobody downloads', () => {
    expect(judge('fresh-thing', { ...good, created: new Date(now - 3 * day).toISOString() }, [], now).block[0]).toMatch(/3 days ago/);
    expect(judge('quiet-thing', { ...good, weeklyDownloads: 12 }, [], now).block[0]).toMatch(/12 downloads/);
  });
  it('blocks a near name unless the package is old and widely used', () => {
    expect(judge('react-datepiicker', { ...good, created: new Date(now - 60 * day).toISOString(), weeklyDownloads: 5000 }, [], now).block.join()).toMatch(/react-datepicker/);
    expect(judge('vitest', good, [], now)).toMatchObject({ block: [], warn: [expect.stringMatching(/vite/)] });
    expect(judge('vitest', { ...good, weeklyDownloads: null }, [], now).block).toEqual([]); // downloads unknown, but a year old
  });
  it('warns about install scripts, no repository and no license without blocking', () => {
    const r = judge('scripty', { ...good, scripts: { postinstall: 'node x.js' }, repository: null, license: null }, [], now);
    expect(r.block).toEqual([]);
    expect(r.warn).toHaveLength(3);
  });
});

describe('addedPackages and approvals', () => {
  it('lists only packages package.json adds, across the dependency fields', () => {
    const base = { dependencies: { a: '1' }, devDependencies: { b: '1' } };
    const head = { dependencies: { a: '2', c: '1' }, devDependencies: { b: '1', d: '1' } };
    expect(addedPackages(base, head)).toEqual(['c', 'd']);
    expect(addedPackages(undefined, head)).toEqual(['a', 'b', 'c', 'd']);
  });
  it('reads the owner approval line from a PR body', () => {
    expect(approvals('## What\nx\n\nDependency approval: foo, @scope/bar\n')).toEqual(['foo', '@scope/bar']);
    expect(approvals('no line here')).toEqual([]);
  });
});

describe('lookup', () => {
  it('reads facts from the registry shape, null for an unknown name, undefined when unreachable', async () => {
    const docs = { 'https://registry.npmjs.org/ok': { time: { created: '2020-01-01' }, 'dist-tags': { latest: '1.0.0' }, versions: { '1.0.0': { scripts: { postinstall: 'x' }, license: 'MIT' } }, repository: { url: 'r' } }, 'https://api.npmjs.org/downloads/point/last-week/ok': { downloads: 42 }, 'https://registry.npmjs.org/gone': null };
    const get = async url => { if (url.includes('down')) return docs[url]; if (url in docs) return docs[url]; throw new Error('net'); };
    expect(await lookup('ok', get)).toMatchObject({ weeklyDownloads: 42, license: 'MIT', scripts: { postinstall: 'x' } });
    expect(await lookup('gone', get)).toBeNull();
    expect(await lookup('down', async () => { throw new Error('net'); })).toBeUndefined();
  });
});
