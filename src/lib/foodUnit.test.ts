import { describe, expect, it } from 'vitest';
import { amountText, isUnit, pluralOf, unitWord, usualStart } from './foodUnit.js';

describe('pluralOf', () => {
  it('adds s, es after s x z ch sh, and ies after a consonant and y', () => {
    expect(pluralOf('egg')).toBe('eggs');
    expect(pluralOf('slice')).toBe('slices');
    expect(pluralOf('box')).toBe('boxes');
    expect(pluralOf('bus')).toBe('buses');
    expect(pluralOf('sandwich')).toBe('sandwiches');
    expect(pluralOf('dish')).toBe('dishes');
    expect(pluralOf('berry')).toBe('berries');
    expect(pluralOf('tray')).toBe('trays');
  });
});

describe('unitWord and amountText', () => {
  const egg = { unit: 'egg' };
  it('is singular for exactly 1 and plural otherwise, fractions included', () => {
    expect(amountText(1, egg)).toBe('1 egg');
    expect(amountText(4, egg)).toBe('4 eggs');
    expect(amountText(0.5, egg)).toBe('0.5 eggs');
    expect(amountText(1.5, egg)).toBe('1.5 eggs');
  });
  it('uses the typed plural, and says portion or portions with no unit', () => {
    expect(amountText(2, { unit: 'loaf', plural: 'loaves' })).toBe('2 loaves');
    expect(amountText(1, { unit: 'loaf', plural: 'loaves' })).toBe('1 loaf');
    expect(amountText(1)).toBe('1 portion');
    expect(amountText(3)).toBe('3 portions');
    expect(unitWord(2, {})).toBe('portions');
  });
});

describe('isUnit', () => {
  it('takes 1 to 20 letters, spaces, hyphens and apostrophes, starting with a letter', () => {
    for (const ok of ['egg', 'slice', 'piece of toast', 'pop-tart', "baker's dozen", 'Crêpe']) expect(isUnit(ok), ok).toBe(true);
    for (const bad of ['', ' egg', '4 eggs', 'egg!', 'a'.repeat(21), '-egg']) expect(isUnit(bad), bad).toBe(false);
  });
});

describe('usualStart', () => {
  it('opens at the usual amount, or 1', () => {
    expect(usualStart({ cat: 'ready', kcal: 72, p: 6, usual: 4 })).toBe(4);
    expect(usualStart({ cat: 'ready', kcal: 72, p: 6 })).toBe(1);
  });
  it('never opens past what one entry can hold', () => {
    expect(usualStart({ cat: 'ready', kcal: 450, p: 10, usual: 99 })).toBe(22); // 22 x 450 = 9,900 is the most under the calorie cap
  });
});
