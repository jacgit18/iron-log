import { describe, expect, it } from 'vitest';
import { labelFood, microText, packText, planFill } from './labelFill.js';
import { SCAN_TEXT } from './scanPhoto.js';

const label = { kind: 'ok' as const, label: { name: 'Gnocchi', serving: '1 cup', servingG: 140, servingsPerPack: 3, kcal: 210, p: 6, c: 40 } };

describe('packText', () => {
  it('rounds 2.5 to 3, keeps 12, and leaves out nothing usable', () => {
    expect(packText(2.5)).toBe('3');
    expect(packText(12)).toBe('12');
    expect(packText(0.4)).toBeUndefined();
    expect(packText(150)).toBeUndefined();
    expect(packText(undefined)).toBeUndefined();
  });
});

describe('planFill', () => {
  it('replaces the numbers and fills an empty name and note', () => {
    expect(planFill(label, { n: '', note: '', pack: '' })).toEqual({ n: 'Gnocchi', kcal: '210', p: '6', c: '40', f: '', note: '1 serving = 1 cup (140 g).', pack: '3', message: 'Filled from the photo. Check the numbers against the label, then save.' });
  });
  it('keeps a name and a note that are already typed', () => {
    const p = planFill(label, { n: 'My gnocchi', note: 'bought at BJ\'s', pack: '4' });
    expect(p.n).toBeUndefined();
    expect(p.note).toBeUndefined();
    expect(p.pack).toBeUndefined(); // a pack size typed before the scan is kept
    expect(p.kcal).toBe('210');
  });
  it('changes no number for an unreadable or per-100 g label, and may offer the name', () => {
    expect(planFill({ kind: 'unreadable' }, { n: '', note: '', pack: '' })).toEqual({ message: SCAN_TEXT.unreadable });
    expect(planFill({ kind: 'per100g', name: 'Rice' }, { n: '', note: '', pack: '' })).toEqual({ n: 'Rice', message: SCAN_TEXT.per100g });
    expect(planFill({ kind: 'per100g', name: 'Rice' }, { n: 'Mine', note: '', pack: '' })).toEqual({ message: SCAN_TEXT.per100g });
  });
});

describe('vitamins and minerals from a photo', () => {
  const withMicro = { kind: 'ok' as const, label: { name: 'Cereal', kcal: 120, p: 3, micro: { iron: 4.5, vitaminD: 2 } } };
  it('planFill carries them and leaves the four numbers as they were', () => {
    const p = planFill(withMicro, { n: '', note: '', pack: '' });
    expect(p.micro).toEqual({ iron: 4.5, vitaminD: 2 });
    expect(p.kcal).toBe('120');
    expect(planFill(label, { n: '', note: '', pack: '' }).micro).toBeUndefined();
  });
  it('labelFood starts the One-off form with them, marked as read from a photo', () => {
    expect(labelFood(withMicro.label)).toEqual({ n: 'Cereal', kcal: 120, p: 3, micro: { iron: 4.5, vitaminD: 2 }, fromPhoto: true });
  });
  it('microText names each amount with its unit, in the limits table\'s order', () => {
    expect(microText({ zinc: 1.2, iron: 4.5, vitaminD: 2, calcium: 130 })).toBe('Calcium 130 mg, Iron 4.5 mg, Vitamin D 2 mcg, Zinc 1.2 mg');
    expect(microText({})).toBe('');
  });
  it('labelFood has no micro and no mark for a label without amounts, and names an unnamed one', () => {
    expect(labelFood({ kcal: 95, p: 3, c: 12 })).toEqual({ n: 'Food from a label', kcal: 95, p: 3, c: 12 });
  });
});
