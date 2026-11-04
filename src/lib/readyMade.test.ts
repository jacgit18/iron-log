import { describe, expect, it } from 'vitest';
import { readyMadeValues } from './readyMade.js';

const ok = { n: 'Frozen lasagna', kcal: '420', p: '22', c: '', f: '' };

describe('readyMadeValues', () => {
  it('needs a name, calories and protein; carbs and fat are optional', () => {
    expect(readyMadeValues(ok)).toEqual({ kcal: 420, p: 22 });
    expect(readyMadeValues({ ...ok, c: '48', f: '15.5' })).toEqual({ kcal: 420, p: 22, c: 48, f: 15.5 });
    expect(readyMadeValues({ ...ok, n: '  ' })).toEqual({ error: 'Give the food a name.' });
    expect(readyMadeValues({ ...ok, kcal: '' })).toEqual({ error: 'Calories per serving must be a number from 1 to 9,999.' });
    expect(readyMadeValues({ ...ok, p: '' })).toEqual({ error: 'Protein per serving must be a number from 0 to 999 g.' });
  });
  it('refuses numbers out of range, and zero protein is allowed', () => {
    expect(readyMadeValues({ ...ok, kcal: '0' })).toHaveProperty('error');
    expect(readyMadeValues({ ...ok, kcal: '10000' })).toHaveProperty('error');
    expect(readyMadeValues({ ...ok, p: '1000' })).toHaveProperty('error');
    expect(readyMadeValues({ ...ok, c: '1000' })).toHaveProperty('error');
    expect(readyMadeValues({ ...ok, f: 'x' })).toHaveProperty('error');
    expect(readyMadeValues({ ...ok, p: '0' })).toEqual({ kcal: 420, p: 0 });
  });

  it('takes an optional whole number of servings per pack, 1 to 99', () => {
    const base = { n: 'Gnocchi', kcal: '210', p: '6', c: '', f: '' };
    expect(readyMadeValues({ ...base, pack: '12' })).toEqual({ kcal: 210, p: 6, servings: 12 });
    expect(readyMadeValues({ ...base, pack: '' })).toEqual({ kcal: 210, p: 6 });
    expect(readyMadeValues({ ...base })).toEqual({ kcal: 210, p: 6 });
    expect(readyMadeValues({ ...base, pack: '0' })).toEqual({ kcal: 210, p: 6 });
    for (const bad of ['2.5', '100', '-3', 'ten', '1e2']) expect(readyMadeValues({ ...base, pack: bad }), bad).toEqual({ error: 'Servings per pack must be a whole number from 1 to 99.' });
  });

  it('takes an optional usual amount in half steps, a unit name and a plural', () => {
    const base = { n: 'Egg', kcal: '72', p: '6', c: '', f: '' };
    expect(readyMadeValues({ ...base, usual: '4', unit: 'egg' })).toEqual({ kcal: 72, p: 6, usual: 4, unit: 'egg' });
    expect(readyMadeValues({ ...base, usual: '1.5', unit: ' egg ' })).toEqual({ kcal: 72, p: 6, usual: 1.5, unit: 'egg' });
    expect(readyMadeValues({ ...base, usual: '1' })).toEqual({ kcal: 72, p: 6 }); // 1 is what Ate this opens at anyway
    expect(readyMadeValues({ ...base })).toEqual({ kcal: 72, p: 6 });
    expect(readyMadeValues({ ...base, usual: '', unit: '', plural: '' })).toEqual({ kcal: 72, p: 6 });
    expect(readyMadeValues({ ...base, unit: 'loaf', plural: 'loaves' })).toEqual({ kcal: 72, p: 6, unit: 'loaf', plural: 'loaves' });
    expect(readyMadeValues({ ...base, unit: 'box', plural: 'boxes' })).toEqual({ kcal: 72, p: 6, unit: 'box' }); // the rule already gives boxes
  });
  it('refuses a usual amount off the half steps or out of range, a bad unit, and a plural with no unit', () => {
    const base = { n: 'Egg', kcal: '72', p: '6', c: '', f: '' };
    for (const bad of ['2.3', '0', '100', '-1', 'four', '0.25']) expect(readyMadeValues({ ...base, usual: bad }), bad).toEqual({ error: 'Usual amount must be from 0.5 to 99 in half steps, like 4 or 1.5.' });
    for (const bad of ['4 eggs', 'egg!', 'a'.repeat(21)]) expect(readyMadeValues({ ...base, unit: bad }), bad).toEqual({ error: 'The unit name must be 1 to 20 letters, like egg or slice.' });
    expect(readyMadeValues({ ...base, plural: 'eggs' })).toEqual({ error: 'Add the unit name first, or clear the plural.' });
    expect(readyMadeValues({ ...base, unit: 'egg', plural: 'eggs!' })).toEqual({ error: 'The plural must be 1 to 20 letters, like loaves.' });
  });
});
