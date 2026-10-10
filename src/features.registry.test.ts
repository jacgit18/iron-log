import { describe, expect, it } from 'vitest';
import { FEATURES } from './features.js';
import featuresSource from './features.ts?raw';

// Keeps the FEATURES registry honest (see feature-flags.md): no dead flags, no unregistered names, and every line says when it goes.

// Every source file under src/ (not tests, not the registry itself, which only mentions the call in its comment), as text.
const sources = import.meta.glob<string>(['./**/*.{ts,tsx,js,jsx}', '!./**/*.test.*', '!./features.ts'], { query: '?raw', import: 'default', eager: true });

const used = new Set<string>();
for (const text of Object.values(sources)) {
  for (const m of text.matchAll(/useFeature\(\s*['"]([^'"]+)['"]\s*\)/g)) used.add(m[1]);
}

describe('FEATURES registry', () => {
  it('every useFeature name is registered', () => {
    expect([...used].filter(n => !(n in FEATURES))).toEqual([]);
  });
  it('every registered feature is used by a useFeature call (no dead flags)', () => {
    expect(Object.keys(FEATURES).filter(n => !used.has(n))).toEqual([]);
  });
  it('every registry line has a removal condition in a // comment', () => {
    const body = featuresSource.slice(featuresSource.indexOf('export const FEATURES'), featuresSource.indexOf('satisfies'));
    const lines = body.split('\n').filter((l: string) => /^\s*[A-Za-z_$][\w$]*\s*:\s*'(admin|all|off)'/.test(l));
    expect(lines.length).toBe(Object.keys(FEATURES).length);
    expect(lines.filter((l: string) => !/\/\/\s*\S+/.test(l))).toEqual([]);
  });
});
