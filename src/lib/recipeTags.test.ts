import { describe, expect, it } from 'vitest';
import type { Recipe } from '../types.ts';
import { chipOrder, cleanTag, hasTags, liveTags, moveChip, removeTag, renameTag, tagCounts, tagLimitError, toggleChip, visibleChips } from './recipeTags.js';
import { RECIPE_CATEGORIES } from '../shared/recipes.js';

const r = (id: string, tags?: string[]): Recipe => ({ id, n: id, cat: 'other', ing: [{ n: 'x' }], steps: [], ...(tags ? { tags } : {}) });

describe('tags in use', () => {
  const list = [r('a', ['Weeknight', 'Meal prep']), r('b', ['weeknight']), r('c')];
  it('counts a tag once per recipe whatever its case, by name, with the first spelling', () => {
    expect(tagCounts(list)).toEqual([{ tag: 'Meal prep', n: 1 }, { tag: 'Weeknight', n: 2 }]);
  });
  it('cleans a typed tag the way a saved one is', () => {
    expect(cleanTag('  Meal    prep ')).toBe('Meal prep');
    expect(cleanTag('   ')).toBe('');
    expect(cleanTag('x'.repeat(50))).toHaveLength(24);
  });
  it('matches every wanted tag without case', () => {
    expect(hasTags(list[0]!, ['weeknight', 'MEAL PREP'])).toBe(true);
    expect(hasTags(list[1]!, ['weeknight', 'meal prep'])).toBe(false);
    expect(hasTags(list[2]!, [])).toBe(true);
  });
  it('keeps only selected tags that are still in use, in the stored spelling', () => {
    expect(liveTags(list, ['weeknight', 'gone'])).toEqual(['Weeknight']);
  });
  it('says when a save would pass the limit', () => {
    const many = Array.from({ length: 5 }, (_, i) => r(`m${i}`, Array.from({ length: 6 }, (_, j) => `t${i * 6 + j}`)));
    expect(tagLimitError(many, ['t1', 'new'])).toMatch(/30/);
    expect(tagLimitError(many, ['T1'])).toBeNull();
  });
});

describe('renameTag and removeTag', () => {
  const list = [r('a', ['weeknight', 'meal prep']), r('b', ['Weeknight']), r('c', ['dinner']), r('d')];
  it('renames on every recipe that has it and counts them', () => {
    const out = renameTag(list, 'weeknight', 'quick');
    expect(out.changed).toBe(2);
    expect(out.list.map(x => x.tags)).toEqual([['quick', 'meal prep'], ['quick'], ['dinner'], undefined]);
  });
  it('merges into a tag that exists and never repeats it on one recipe', () => {
    const out = renameTag(list, 'weeknight', 'MEAL PREP');
    expect(out.list[0]!.tags).toEqual(['meal prep']);
    expect(out.list[1]!.tags).toEqual(['meal prep']);
  });
  it('a case-only rename changes the spelling', () => {
    expect(renameTag(list, 'weeknight', 'WeekNight').list.map(x => x.tags?.[0])).toEqual(['WeekNight', 'WeekNight', 'dinner', undefined]);
  });
  it('refuses an empty name', () => expect(renameTag(list, 'weeknight', ' ')).toMatchObject({ changed: 0, error: expect.any(String) }));
  it('removes a tag, keeps every recipe, and drops an emptied field', () => {
    const out = removeTag(list, 'WEEKNIGHT');
    expect(out.changed).toBe(2);
    expect(out.list).toHaveLength(4);
    expect(out.list.map(x => x.tags)).toEqual([['meal prep'], undefined, ['dinner'], undefined]);
    expect('tags' in out.list[1]!).toBe(false);
  });
});

describe('built-in chips: hide and order', () => {
  it('shows every category in the built-in order with no setting', () => {
    expect(chipOrder(undefined)).toEqual([...RECIPE_CATEGORIES]);
    expect(visibleChips(undefined, true)).toEqual([...RECIPE_CATEGORIES]);
    expect(visibleChips(undefined, false)).not.toContain('ready'); // the Library has no ready-made foods
  });
  it('puts the saved order first and any category it lacks after, in the built-in order', () => {
    expect(chipOrder({ order: ['sides', 'protein'] }).slice(0, 4)).toEqual(['sides', 'protein', 'carbs', 'sauces']);
    expect(chipOrder({ order: ['sides', 'sides', 'nope' as never] })).toHaveLength(RECIPE_CATEGORIES.length);
  });
  it('leaves hidden chips out on both tabs', () => {
    const cfg = { hide: ['carbs' as const] };
    expect(visibleChips(cfg, true)).not.toContain('carbs');
    expect(visibleChips(cfg, false)).not.toContain('carbs');
  });
  it('hides and shows a chip, and stores nothing when back to the defaults', () => {
    const hidden = toggleChip(undefined, 'drinks');
    expect(hidden).toEqual({ hide: ['drinks'] });
    expect(toggleChip(hidden, 'drinks')).toBeUndefined();
  });
  it('moves a chip one place and stops at the ends', () => {
    const moved = moveChip(undefined, 'carbs', -1);
    expect(chipOrder(moved).slice(0, 2)).toEqual(['carbs', 'protein']);
    expect(moveChip(moved, 'carbs', -1)).toBe(moved);
    expect(moveChip(undefined, 'other', 1)).toBeUndefined();
    expect(moveChip(moved, 'carbs', 1)).toBeUndefined(); // moved back: the default again
  });
  it('keeps the hidden chips when reordering', () => {
    const cfg = moveChip({ hide: ['drinks'] }, 'sides', -1);
    expect(cfg?.hide).toEqual(['drinks']);
    expect(visibleChips(cfg, true).indexOf('sides')).toBeLessThan(visibleChips(cfg, true).indexOf('carbs'));
  });
});
