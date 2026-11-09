import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { supplementNutrientTotals } from '../lib/supplementNutrients.js';
import { cleanSupplementLabel, mapDsldLabel } from './dsldLabel.js';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')) as unknown;
const ddrops = mapDsldLabel(fixture('dsld-320047-ddrops-d3.json'))!;
const gummies = mapDsldLabel(fixture('dsld-276834-gummies-d3.json'))!;
const megaIU = mapDsldLabel(fixture('dsld-66727-mega-men-iu.json'))!;
const megaMcg = mapDsldLabel(fixture('dsld-219004-mega-men-mcg.json'))!;
const row = (l: { rows: { key: string; amount: number; unit: string }[] }, key: string) => l.rows.find(r => r.key === key);

describe('mapDsldLabel on real DSLD labels', () => {
  it('Ddrops Vitamin D3: a drop is a serving in words, vitamin D 50 mcg', () => {
    expect(ddrops.rows).toEqual([{ key: 'vitaminD', amount: 50, unit: 'mcg' }]);
    expect(ddrops.serving).toEqual({ text: '1 drop (0.028 mL or 0.001 fl. oz.)' }); // a liquid: no countable units
    expect(ddrops.entryYear).toBeGreaterThan(2000);
  });
  it('Sunergetic gummies: 2 gummies, vitamin D 50 mcg and sodium; calories and carbohydrate are only listed', () => {
    expect(gummies.serving).toEqual({ text: '2 Gummies', units: 2, form: 'Gummy' });
    expect(gummies.rows).toEqual([{ key: 'vitaminD', amount: 50, unit: 'mcg' }, { key: 'sodium', amount: 10, unit: 'mg' }]);
    expect(gummies.other.map(o => o.name)).toEqual(['Calories', 'Total Carbohydrate']);
    expect(gummies.other[0]).toEqual({ name: 'Calories', amount: 15, unit: 'Calorie(s)' });
  });
  it('Mega Men (IU label): vitamin A, D and E stay in IU, the rest are the label amounts', () => {
    expect(row(megaIU, 'vitaminA')).toEqual({ key: 'vitaminA', amount: 5000, unit: 'IU' });
    expect(row(megaIU, 'vitaminD')).toEqual({ key: 'vitaminD', amount: 1600, unit: 'IU' });
    expect(row(megaIU, 'vitaminE')).toEqual({ key: 'vitaminE', amount: 30, unit: 'IU' });
    expect(row(megaIU, 'vitaminC')).toEqual({ key: 'vitaminC', amount: 300, unit: 'mg' });
    expect(row(megaIU, 'folate')).toEqual({ key: 'folate', amount: 400, unit: 'mcg' }); // "Folic Acid" row, group Folate
    expect(row(megaIU, 'zinc')?.amount).toBe(25);
    expect(megaIU.serving).toEqual({ text: '2 Beige Caplets', units: 2, form: 'Caplet' });
  });
  it('Mega Men (mcg label): folic acid inside the DFE total wins; vitamin A, D and E are weights', () => {
    expect(row(megaMcg, 'folate')).toEqual({ key: 'folate', amount: 400, unit: 'mcg' }); // not the 680 mcg DFE
    expect(row(megaMcg, 'vitaminA')).toEqual({ key: 'vitaminA', amount: 1500, unit: 'mcg' });
    expect(row(megaMcg, 'vitaminD')).toEqual({ key: 'vitaminD', amount: 40, unit: 'mcg' });
    expect(row(megaMcg, 'vitaminE')).toEqual({ key: 'vitaminE', amount: 20.1, unit: 'mg' });
  });
  it('lists the nutrients the app does not track, never counts them', () => {
    const names = megaMcg.other.map(o => o.name);
    for (const n of ['Thiamine', 'Riboflavin', 'Biotin', 'Pantothenic Acid', 'Choline', 'Manganese', 'Chromium', 'Molybdenum']) expect(names).toContain(n);
    expect(megaMcg.rows.map(r => r.key)).not.toContain('thiamine');
    expect(megaMcg.rows.length).toBeLessThanOrEqual(20);
  });
  it('a blend with no stated amount is "amount not stated"; one with a total keeps it, and its stated parts are listed', () => {
    const blend = megaIU.other.find(o => o.name === 'Super Antioxidant Blend');
    expect(blend).toEqual({ name: 'Super Antioxidant Blend' }); // 0 "NP": no amount key at all
    expect(megaIU.other.find(o => o.name === 'Alpha-Lipoic Acid')).toEqual({ name: 'Alpha-Lipoic Acid', amount: 25, unit: 'mg' });
    expect(megaMcg.other.find(o => o.name === 'Amino Acid Blend')).toEqual({ name: 'Amino Acid Blend', amount: 100, unit: 'mg' });
  });
  it('a label with no ingredient rows, or junk, is null', () => {
    expect(mapDsldLabel({ ingredientRows: [] })).toBeNull();
    expect(mapDsldLabel(null)).toBeNull();
    expect(mapDsldLabel('<html>')).toBeNull();
    expect(mapDsldLabel({ ingredientRows: [null, 3, { name: 'x' }] })?.rows).toEqual([]);
  });
  it('the first row of a nutrient wins; a second one is listed, not added', () => {
    const l = mapDsldLabel({ ingredientRows: [{ name: 'Vitamin C', ingredientGroup: 'Vitamin C', category: 'vitamin', quantity: [{ quantity: 100, unit: 'mg' }] }, { name: 'Ester-C', ingredientGroup: 'Vitamin C', category: 'vitamin', quantity: [{ quantity: 50, unit: 'mg' }] }] })!;
    expect(l.rows).toEqual([{ key: 'vitaminC', amount: 100, unit: 'mg' }]);
    expect(l.other).toEqual([{ name: 'Ester-C', amount: 50, unit: 'mg' }]);
  });
  it('IU is kept only where Totals can read or knowingly skip it (D, A, E); calcium in IU is listed', () => {
    const l = mapDsldLabel({ ingredientRows: [{ name: 'Calcium', ingredientGroup: 'Calcium', category: 'mineral', quantity: [{ quantity: 5, unit: 'IU' }] }] })!;
    expect(l.rows).toEqual([]);
    expect(l.other).toEqual([{ name: 'Calcium', amount: 5, unit: 'IU' }]);
  });
});

describe('the mapped rows through the Totals sheet (Done when 2)', () => {
  const items = (rows: typeof ddrops.rows) => [{ id: 'a', n: 'Ddrops', slot: 'morning' as const, nutrients: rows }];
  it('Ddrops Vitamin D3 in Morning, ticked, adds 50 mcg to vitamin D', () => {
    const t = supplementNutrientTotals(items(ddrops.rows), { '2026-11-09': { a: true } }, '2026-11-09');
    expect(t).toHaveLength(1);
    expect(t[0]).toMatchObject({ key: 'vitaminD', fromSupplements: 50 });
  });
  it('the IU label converts vitamin D (1600 IU = 40 mcg) and lists A and E as not added', () => {
    const t = supplementNutrientTotals(items(megaIU.rows), { '2026-11-09': { a: true } }, '2026-11-09');
    expect(t.find(x => x.key === 'vitaminD')?.fromSupplements).toBe(40);
    expect(t.find(x => x.key === 'vitaminA')?.notAdded).toHaveLength(1);
    expect(t.find(x => x.key === 'vitaminE')?.notAdded).toHaveLength(1);
  });
});

describe('cleanSupplementLabel (the app reads the server answer as untrusted)', () => {
  it('round-trips what the mapper makes', () => {
    for (const l of [ddrops, gummies, megaIU, megaMcg]) expect(cleanSupplementLabel(JSON.parse(JSON.stringify(l)))).toEqual(l);
  });
  it('drops unknown keys and units, bad amounts and repeated keys; rejects a non-label', () => {
    const c = cleanSupplementLabel({ name: 'x', serving: null, other: [{ name: '' }, { name: 'ok' }], rows: [{ key: 'iron', amount: 18, unit: 'mg' }, { key: 'iron', amount: 1, unit: 'mg' }, { key: 'bogus', amount: 1, unit: 'mg' }, { key: 'zinc', amount: -1, unit: 'mg' }, { key: 'zinc', amount: 5, unit: 'lb' }] })!;
    expect(c.rows).toEqual([{ key: 'iron', amount: 18, unit: 'mg' }]);
    expect(c.other).toEqual([{ name: 'ok' }]);
    expect(cleanSupplementLabel({ rows: 'no' })).toBeNull();
    expect(cleanSupplementLabel(null)).toBeNull();
  });
});
