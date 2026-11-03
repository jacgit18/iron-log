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
});
