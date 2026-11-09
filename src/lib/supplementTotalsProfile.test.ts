import { describe, expect, it } from 'vitest';
import type { DietEntry, SupplementItem, Taken } from '../types.ts';
import { limitWarning, totalsView } from './supplementTotalsView.js';

// Brief recommendations-by-age-sex, PR 2: with a profile the sheet and the warning line use the person's own band; without one nothing changes.
const day = '2026-09-24';
const item = (nutrients: SupplementItem['nutrients']): SupplementItem => ({ id: 'a', n: 'Pill', slot: 'morning', nutrients });
const taken: Taken = { [day]: { a: true } };
const woman = (birthYear: number) => ({ birthYear, sex: 'female' as const });
const man = (birthYear: number) => ({ birthYear, sex: 'male' as const });
const calcium = (mg: number) => [item([{ key: 'calcium', amount: mg, unit: 'mg' }])];

describe('limits by band', () => {
  it('judges calcium against the person\'s own limit: 2,200 mg is close at 40 and over at 52', () => {
    const at40 = totalsView(calcium(2200), taken, day, 'taken', [], woman(1986)).rows[0]!;
    expect(at40).toMatchObject({ status: 'close', limitText: 'Limit 2,500 mg for ages 19 to 50', statusText: 'Close to the limit (88%)' });
    const at52 = totalsView(calcium(2200), taken, day, 'taken', [], woman(1974)).rows[0]!;
    expect(at52).toMatchObject({ status: 'over', limitText: 'Limit 2,000 mg for ages 51 to 70', statusText: 'Over the limit for ages 51 to 70 by 200 mg' });
  });
  it('with no profile, a partial one or an age out of range nothing changes from today', () => {
    for (const p of [undefined, {}, { sex: 'male' as const }, { birthYear: 1974 }, woman(2010), woman(1890)]) {
      const r = totalsView(calcium(2200), taken, day, 'taken', [], p).rows[0]!;
      expect(r, JSON.stringify(p)).toMatchObject({ status: 'over', limitText: 'Limit 2,000 mg', statusText: 'Over the limit by 200 mg' });
      expect(r.recommendedText).toContain('Recommended 1,000 to 1,200 mg a day');
    }
  });
  it('the day\'s warning line follows the person\'s limit', () => {
    expect(limitWarning(calcium(2200), taken, day, [], woman(1986))).toBe('');
    expect(limitWarning(calcium(2200), taken, day, [], woman(1974))).toContain('Over an upper limit today: Calcium');
    expect(limitWarning(calcium(2200), taken, day, [])).toContain('Calcium');
  });
});

describe('recommended amounts by group', () => {
  it('names the group and the figure, with the general-information line', () => {
    const r = totalsView([item([{ key: 'magnesium', amount: 100, unit: 'mg' }])], taken, day, 'taken', [], man(1990)).rows[0]!;
    expect(r.recommendedText).toBe('Recommended for men ages 31 and over: 420 mg a day. General information, not medical advice.');
    const w = totalsView([item([{ key: 'folate', amount: 100, unit: 'mcg' }])], taken, day, 'taken', [], woman(1990)).rows[0]!;
    expect(w.recommendedText).toContain('Recommended for women ages 19 and over: 400 mcg a day (mcg DFE, dietary folate equivalents).');
  });
  it('the five without a limit show a share of the person\'s own amount and never warn', () => {
    const k = (mg: number) => [item([{ key: 'potassium', amount: mg, unit: 'mg' }])];
    const w = totalsView(k(1300), taken, day, 'taken', [], woman(1990)).targets[0]!;
    expect(w.statusText).toBe('50% of the recommended amount for women ages 19 and over');
    expect(w.recommendedText).toBe('Adequate Intake for women ages 19 and over: 2,600 mg a day. General information, not medical advice.');
    const m = totalsView(k(1300), taken, day, 'taken', [], man(1990)).targets[0]!;
    expect(m.statusText).toBe('38% of the recommended amount for men ages 19 and over');
    expect(totalsView(k(99999), taken, day, 'taken', [], man(1990)).rows).toEqual([]);
  });
  it('sodium keeps its level to stay under and names the group\'s Adequate Intake', () => {
    const na = [item([{ key: 'sodium', amount: 1000, unit: 'mg' }])];
    const r = totalsView(na, taken, day, 'taken', [], man(1990)).targets[0]!;
    expect(r.statusText).toBe('43% of the 2,300 mg level to stay under');
    expect(r.recommendedText).toContain('Adequate Intake for men ages 19 and over: 1,500 mg a day. Level to stay under: 2,300 mg a day.');
  });
  it('counts food the same way (the group changes the figure, not the sum)', () => {
    const eaten: DietEntry[] = [{ id: 'e', d: day, n: 'Beans', kcal: 100, p: 5, micro: { potassium: 1300 } }];
    expect(totalsView([], taken, day, 'taken', eaten, woman(1990)).targets[0]!.statusText).toBe('50% of the recommended amount for women ages 19 and over');
  });
});

describe('profileNote', () => {
  const plain = [item([{ key: 'zinc', amount: 5, unit: 'mg' }])];
  const note = (p?: Parameters<typeof totalsView>[5]) => totalsView(plain, taken, day, 'taken', [], p).profileNote;
  it('asks for a profile, says the age is not shown, or says whose amounts these are and what they leave out', () => {
    expect(note()).toBe('Add your birth year and sex in Settings to see your own amounts. Until then the adult range is shown.');
    expect(note({ sex: 'female' })).toContain('need both a birth year and a sex'); // one field given, or "Prefer not to say": no nagging, just why the range is shown
    expect(note(woman(2010))).not.toContain('Add your');
    expect(note(woman(2010))).toBe('Amounts for your age are not shown. The adult range is used.');
    expect(note(woman(1990))).toContain('do not cover pregnancy or breastfeeding');
  });
});
