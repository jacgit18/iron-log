import { describe, expect, it } from 'vitest';
import type { SupplementItem } from '../types.ts';
import { fmtAmount, limitWarning, totalsView } from './supplementTotalsView.js';

const mag = (id: string, amount: number): SupplementItem => ({ id, n: `Mag ${id}`, slot: 'morning', nutrients: [{ key: 'magnesium', amount, unit: 'mg' }] });
const day = '2026-09-24';

describe('totalsView', () => {
  it('formats a row with figure, limit, words and recommended range', () => {
    const v = totalsView([mag('a', 175)], { [day]: { a: true } }, day, 'taken');
    expect(v.hasData).toBe(true);
    expect(v.rows).toHaveLength(1);
    const r = v.rows[0]!;
    expect(r.figure).toBe('175 mg');
    expect(r.limitText).toBe('Limit 350 mg');
    expect(r.percent).toBe(50);
    expect(r.status).toBe('under');
    expect(r.statusText).toBe('50% of the limit');
    expect(r.products).toEqual(['Mag a 175 mg']);
    expect(r.recommendedText).toContain('Recommended 310 to 420 mg a day');
    expect(r.scopeNote).toContain('supplements and medicines only');
  });

  it('says close at 80% and over by how much, and fills the bar when over', () => {
    const close = totalsView([mag('a', 300)], { [day]: { a: true } }, day, 'taken').rows[0]!;
    expect(close.status).toBe('close');
    expect(close.statusText).toBe('Close to the limit (86%)');
    const over = totalsView([mag('a', 300), mag('b', 100)], { [day]: { a: true, b: true } }, day, 'taken').rows[0]!;
    expect(over.status).toBe('over');
    expect(over.statusText).toBe('Over the limit by 50 mg');
    expect(over.percent).toBe(100);
    expect(over.products).toEqual(['Mag a 300 mg', 'Mag b 100 mg']);
  });

  it('counts only what was ticked, or everything scheduled on that basis', () => {
    const items = [mag('a', 100), mag('b', 200)];
    expect(totalsView(items, { [day]: { a: true } }, day, 'taken').rows[0]!.figure).toBe('100 mg');
    expect(totalsView(items, { [day]: { a: true } }, day, 'scheduled').rows[0]!.figure).toBe('300 mg');
  });

  it('separates no data from nothing taken', () => {
    const none = totalsView([{ id: 'x', n: 'Plain', slot: 'morning' }], {}, day, 'taken');
    expect(none).toMatchObject({ rows: [], targets: [], hasData: false, noneCounted: false, coverage: '' });
    const untaken = totalsView([mag('a', 100)], {}, day, 'taken');
    expect(untaken.hasData).toBe(true);
    expect(untaken.noneCounted).toBe(true);
  });

  it('lists an IU row that cannot be added with its reason', () => {
    const item: SupplementItem = { id: 'a', n: 'A cap', slot: 'morning', nutrients: [{ key: 'vitaminA', amount: 5000, unit: 'IU' }] };
    const r = totalsView([item], { [day]: { a: true } }, day, 'taken').rows[0]!;
    expect(r.figure).toBe('0 mcg');
    expect(r.notAdded[0]).toContain('A cap: 5,000 IU not added.');
  });
});

describe('limitWarning', () => {
  it('names the nutrients over their limit and is empty otherwise', () => {
    const items = [mag('a', 400)];
    expect(limitWarning(items, { [day]: { a: true } }, day)).toBe('Over an upper limit today: Magnesium. Totals shows what each limit counts. General information, not medical advice.');
    expect(limitWarning(items, {}, day)).toBe('');
    expect(limitWarning([{ id: 'x', n: 'Plain', slot: 'morning' }], {}, day)).toBe('');
  });
});

describe('fmtAmount', () => {
  it('groups thousands and trims decimals', () => {
    expect(fmtAmount(1250)).toBe('1,250');
    expect(fmtAmount(0.5)).toBe('0.5');
    expect(fmtAmount(2.3333)).toBe('2.33');
  });
});

// Brief supplement-more-nutrients, PR 2: the eight added nutrients ride the generic totals code. Limit nutrients are rows with a status; the five targets never warn.
describe('the eight added nutrients', () => {
  const added: SupplementItem = { id: 'a', n: 'Blend', slot: 'morning', nutrients: [
    { key: 'manganese', amount: 15, unit: 'mg' }, { key: 'thiamin', amount: 12, unit: 'mg' }, { key: 'choline', amount: 500, unit: 'mg' }, { key: 'biotin', amount: 5, unit: 'mg' },
  ] };
  const taken = { [day]: { a: true as const } };
  it('puts choline and manganese in the limit rows, with the limit, status and scope note of their tables', () => {
    const v = totalsView([added], taken, day, 'taken');
    expect(v.rows.map(r => r.key)).toEqual(['choline', 'manganese']);
    expect(v.rows[0]).toMatchObject({ figure: '500 mg', limitText: 'Limit 3,500 mg', status: 'under' });
    expect(v.rows[1]).toMatchObject({ figure: '15 mg', limitText: 'Limit 11 mg', status: 'over', statusText: 'Over the limit by 4 mg' });
    expect(v.rows[1]!.scopeNote).toContain('counts both');
  });
  it('puts thiamin and biotin under no upper limit, never over, and converts a biotin row in mg to mcg', () => {
    const v = totalsView([added], taken, day, 'taken');
    expect(v.targets.map(t => t.key)).toEqual(['biotin', 'thiamin']);
    expect(v.targets[0]).toMatchObject({ figure: '5,000 mcg', statusText: '16,667% of the recommended amount' });
    expect(v.targets[1]).toMatchObject({ figure: '12 mg', statusText: 'Above the recommended range' });
    expect(v.targets.every(t => t.scopeNote.startsWith('There is no upper limit'))).toBe(true);
  });
  it('warns about the limit nutrient only', () => {
    const w = limitWarning([added], taken, day);
    expect(w).toContain('Manganese');
    expect(w).not.toMatch(/Thiamin|Biotin|Choline/);
  });
});
