import { describe, expect, it } from 'vitest';
import { cardVitamins, microLine, microList, microShares, recommendedAmount } from './microLine.js';

// Brief recipe-auto-nutrition, Done when 5: the two nutrients a food gives most of, as a share of a day's recommended amount, and the top five.
describe('recommendedAmount', () => {
  it('is the highest adult figure from the limits or the targets table', () => {
    expect(recommendedAmount('manganese')).toBe(2.3);
    expect(recommendedAmount('potassium')).toBe(3400);
  });
  it('leaves sodium out: its figure is a level to stay under', () => {
    expect(recommendedAmount('sodium')).toBeUndefined();
  });
  it('uses the person’s own figure when a profile gives one', () => {
    expect(recommendedAmount('vitaminC', { birthYear: 1990, sex: 'female' }, '2026-11-15')).toBe(75);
  });
});

describe('microShares', () => {
  it('ranks by share of a day, biggest first, and rounds to whole percent', () => {
    const s = microShares({ manganese: 0.53, vitaminC: 45, zinc: 1.1 });
    expect(s.map(x => [x.key, x.percent])).toEqual([['manganese', 23], ['vitaminC', 50], ['zinc', 10]].sort((a, b) => (b[1] as number) - (a[1] as number)));
    expect(s[0]!.text).toBe('Vitamin C 50%');
  });
  it('scales by the portion', () => {
    expect(microShares({ manganese: 0.46 }, 2)[0]!.percent).toBe(40);
  });
  it('skips sodium and returns nothing without micro or a usable factor', () => {
    expect(microShares({ sodium: 900 })).toEqual([]);
    expect(microShares(undefined)).toEqual([]);
    expect(microShares({ zinc: 5 }, 0)).toEqual([]);
  });
  it('keeps the table order on equal shares', () => {
    const a = microShares({ vitaminC: 90, zinc: 11 }); // both 100% of their highest figure
    expect(a.map(x => x.key)).toEqual(['vitaminC', 'zinc']);
  });
  it('does not cap a share over 100', () => {
    expect(microShares({ vitaminC: 180 })[0]!.percent).toBe(200);
  });
});

describe('microLine and microList', () => {
  const s = microShares({ manganese: 1.15, copper: 450, zinc: 5.5, vitaminC: 9, iron: 1.8, selenium: 5.5 });
  it('names the top two with a dot between', () => {
    expect(microLine(s)).toBe(`${s[0]!.text} · ${s[1]!.text}`);
  });
  it('is empty for a food with nothing to read', () => {
    expect(microLine([])).toBe('');
  });
  it('lists the top five with amounts and units', () => {
    const l = microList(s);
    expect(l).toHaveLength(5);
    expect(l[0]!.text).toMatch(/^[A-Za-z ]+ [\d.,]+ (mg|mcg|g), \d+% of a day$/);
  });
});

describe('cardVitamins', () => {
  const recipe = { micro: { zinc: 2 }, est: { of: 1, n: 2 } };
  it('a planned card uses the recipe times the portion, marked while the recipe is', () => {
    expect(cardVitamins('r', undefined, recipe, 1.5)).toEqual({ micro: { zinc: 2 }, factor: 1.5, est: true });
    expect(cardVitamins('r', undefined, { micro: { zinc: 2 } }, 1)).toMatchObject({ est: false });
    expect(cardVitamins('r', undefined, { est: { of: 1, n: 2 } }, 1)).toMatchObject({ est: false }); // no vitamins, nothing to mark
  });
  it('a ticked card uses its entry as eaten, whatever the plan portion', () => {
    expect(cardVitamins('r', { micro: { zinc: 4 }, est: true }, recipe, 2)).toEqual({ micro: { zinc: 4 }, factor: 1, est: true });
    expect(cardVitamins('r', { micro: { zinc: 4 } }, recipe, 2)).toMatchObject({ est: false });
  });
  it('a saved-meal card draws nothing', () => {
    expect(cardVitamins('m', undefined, recipe, 1)).toBeNull();
  });
});
