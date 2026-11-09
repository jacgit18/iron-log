import { describe, expect, it } from 'vitest';
import { normSupplementItem } from './listItems.js';
import { cleanMicro } from './foodMicro.js';
import { cleanLabel } from './scan.js';

// The five nutrients without an upper limit ride through every reader that takes a nutrient key: the supplement normaliser, the food micro cleaner and the label scan validator.
describe('the nutrients without an upper limit are accepted everywhere a key is', () => {
  it('a supplement can list them, fiber in grams, and an old item is unchanged', () => {
    const item = normSupplementItem({ id: 's', n: 'Fiber mix', slot: 'morning', nutrients: [{ key: 'fiber', amount: 5, unit: 'g' }, { key: 'vitaminB12', amount: 500, unit: 'mcg' }, { key: 'potassium', amount: 99, unit: 'mg' }] })!;
    expect(item.nutrients).toEqual([{ key: 'fiber', amount: 5, unit: 'g' }, { key: 'vitaminB12', amount: 500, unit: 'mcg' }, { key: 'potassium', amount: 99, unit: 'mg' }]);
    expect('nutrients' in normSupplementItem({ id: 'o', n: 'Plain', slot: '' })!).toBe(false);
  });
  it('food and recipe amounts keep them in table order, and drop a misread over the cap', () => {
    expect(cleanMicro({ sodium: 470, potassium: 300, zinc: 2 })).toEqual({ zinc: 2, potassium: 300, sodium: 470 });
    expect(cleanMicro({ sodium: 46001, fiber: 761, vitaminK: 2401, vitaminB12: 49 })).toBeNull();
    expect(cleanMicro({ sodium: 46000, fiber: 760 })).toEqual({ fiber: 760, sodium: 46000 });
  });
  it('the label scan validator reads them and still cannot add a field', () => {
    expect(cleanLabel({ kcal: 100, p: 2, micro: { sodium: 140, fiber: 3, vitaminK: 20, potassium: 200, vitaminB12: 0.6, evil: 4 } })).toEqual({ kind: 'ok', label: { kcal: 100, p: 2, micro: { vitaminK: 20, vitaminB12: 0.6, potassium: 200, fiber: 3, sodium: 140 } } });
  });
});
