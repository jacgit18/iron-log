import { describe, expect, it } from 'vitest';
import { rescale, scaleAmount, servingsNote, typedAmount, writeQuantity, type ScaleRow } from './recipeScale.js';

const s = (amt: string, f: number) => scaleAmount(amt, f).text;

describe('scaleAmount', () => {
  it.each([
    ['2 cups', 2, '4 cups'],
    ['1 1/2 cups', 2, '3 cups'],
    ['1/2 tsp', 3, '1½ tsp'],
    ['1-1/2 cups', 2, '3 cups'],
    ['½ cup', 2 / 3, '⅓ cup'],
    ['1½ cups', 2, '3 cups'],
    ['1 ½ cups', 0.5, '¾ cups'],
    ['1.5 lb', 2, '3 lb'],
    ['250g', 2, '500g'],
    ['2-3 cloves', 2, '4-6 cloves'],
    ['2 to 3 cloves', 2, '4 to 6 cloves'],
    ['2–3 cloves', 3, '6–9 cloves'],
    ['1 (14 oz) can', 2, '2 (14 oz) can'],
    ['3', 2, '6'],
  ])('%s x %s = %s', (amt, f, out) => expect(s(amt, f)).toBe(out));

  it('writes fractions as the nearest eighth, third or sixth', () => {
    expect(s('1 cup', 1 / 3)).toBe('⅓ cup');
    expect(s('1 cup', 1.55)).toBe('1½ cup');
    expect(s('1 tbsp', 1 / 16)).toBe('0.06 tbsp');
  });
  it('leaves text that does not start with a number as written', () => {
    for (const a of ['pinch', 'to taste', 'a handful', 'one cup']) expect(scaleAmount(a, 2)).toEqual({ text: a, scaled: false });
    expect(scaleAmount('', 2)).toEqual({ text: '', scaled: false });
  });
  it('returns the text exactly with a factor of 1, and refuses a bad factor', () => {
    expect(scaleAmount('1 ½  cups', 1)).toEqual({ text: '1 ½  cups', scaled: true });
    for (const f of [0, -1, Number.NaN, Infinity]) expect(scaleAmount('2 cups', f).scaled).toBe(false);
  });
  it('keeps the original when the scaled text would pass the amount limit', () => {
    const long = `2 ${'x'.repeat(38)}`;
    expect(scaleAmount(long, 5)).toEqual({ text: long, scaled: false });
  });
  it('leaves a compound amount as written rather than scale half of it', () => {
    for (const a of ['2 tablespoons plus 1 teaspoon', '1 lb / 450 g', '1 cup or 2 sticks', '1 cup + 2 tbsp', '1 cup and 2 tbsp']) expect(scaleAmount(a, 2)).toEqual({ text: a, scaled: false });
    expect(s('1 (14 oz) can', 2)).toBe('2 (14 oz) can'); // a size in parentheses is not a second quantity
  });
  it('does not treat a zero denominator as a fraction', () => expect(scaleAmount('1/0 cup', 2).scaled).toBe(false));
});

describe('writeQuantity', () => {
  it('rounds up into the next whole number and keeps big numbers whole', () => {
    expect(writeQuantity(1.97)).toBe('2');
    expect(writeQuantity(24.6)).toBe('25');
    expect(writeQuantity(0.5)).toBe('½');
    expect(writeQuantity(2.75)).toBe('2¾');
  });
});

describe('rescale', () => {
  const rows: ScaleRow[] = [{ amt: '2 cups' }, { amt: 'pinch' }, { amt: '' }, { amt: '1/2 tsp' }];
  it('takes the amounts as being for the new servings when there were none before', () => {
    const r = rescale(rows, null, 4);
    expect(r.rows.map(x => x.amt)).toEqual(['2 cups', 'pinch', '', '1/2 tsp']);
    expect(r.left).toBe(0);
  });
  it('scales every amount from its base and counts the ones it could not read', () => {
    const r = rescale(rows, 4, 8);
    expect(r.rows.map(x => x.amt)).toEqual(['4 cups', 'pinch', '', '1 tsp']);
    expect(r.left).toBe(1);
  });
  it('gives the original text back after going up and down again', () => {
    const up = rescale(rows, 4, 8).rows;
    const odd = rescale(up, 8, 5).rows;
    expect(rescale(odd, 5, 4).rows.map(x => x.amt)).toEqual(['2 cups', 'pinch', '', '1/2 tsp']);
  });
  it('scales from a hand-typed amount, not from the old one', () => {
    const typed = rows.map((r, i) => (i === 0 ? typedAmount(r, '3 cups', 4) : r));
    const r = rescale(typed, 4, 8);
    expect(r.rows[0]!.amt).toBe('6 cups');
    expect(rescale(r.rows, 8, 4).rows[0]!.amt).toBe('3 cups');
  });
  it('anchors a typed amount to the servings in view only when they are known', () => {
    const row: ScaleRow = { amt: 'x' };
    expect(typedAmount(row, '2', null).base).toBeUndefined();
    expect(typedAmount(row, '2', 6).base).toEqual({ amt: '2', servings: 6 });
  });
});

describe('servingsNote', () => {
  it('says what the amounts are for when there was no number before, and only if there are amounts', () => {
    expect(servingsNote(null, 6, 0, true)).toBe('The amounts are taken as being for 6 servings.');
    expect(servingsNote(null, 1, 0, true)).toBe('The amounts are taken as being for 1 serving.');
    expect(servingsNote(null, 6, 0, false)).toBe('');
  });
  it('counts the amounts left as written, or says nothing', () => {
    expect(servingsNote(4, 8, 1, true)).toBe('1 amount left as written.');
    expect(servingsNote(4, 8, 3, true)).toBe('3 amounts left as written.');
    expect(servingsNote(4, 8, 0, true)).toBe('');
  });
});
