import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..');
const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const p = join(dir, e.name);
  return e.isDirectory() ? files(p) : /\.tsx$/.test(e.name) ? [p] : [];
});

// Ownership leftovers 4b: one id per control. The water goal's inline editor owns #water-goal-edit; no other control reuses it.
describe('nutrition ids', () => {
  it('has id="water-goal-edit" on one element only, the inline editor button in WaterGoal.tsx', () => {
    const hits = files(SRC).filter(f => /id="water-goal-edit"/.test(readFileSync(f, 'utf8'))).map(f => f.slice(SRC.length + 1).split('\\').join('/'));
    expect(hits).toEqual(['components/nutritionBoard/WaterGoal.tsx']);
  });
});
