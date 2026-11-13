import { describe, expect, it } from 'vitest';
import { compareLabel, summarize } from './lib/scanExpect.mjs';

// The comparison behind scan-eval --expect: what makes a photo pass, and the 9-of-10 verdict. The expected values are what a label prints; these tests use two small invented ones.
const spec = { kind: 'label', kcal: 140, p: 5, c: 29, f: 2.5, micro: { calcium: 130, iron: 12.6, folate: [200, 120] }, percentOnly: ['vitaminA', 'zinc'] };
const ok = (label: Record<string, unknown>) => ({ kind: 'ok', label: { kcal: 140, p: 5, ...label } });

describe('compareLabel', () => {
  it('passes a scan that reads the numbers and the amounts the label prints', () => {
    const r = compareLabel(ok({ c: 29, f: 2.5, micro: { calcium: 130, iron: 12.6, folate: 120 } }), spec);
    expect(r).toMatchObject({ pass: true, calProteinOk: true, problems: [] });
  });
  it('accepts calories and protein within a small tolerance and fails outside it', () => {
    expect(compareLabel(ok({ p: 5.4 }), spec).calProteinOk).toBe(true);
    expect(compareLabel({ kind: 'ok', label: { kcal: 143, p: 5 } }, spec).calProteinOk).toBe(true);
    const bad = compareLabel({ kind: 'ok', label: { kcal: 210, p: 5 } }, spec); // the "with milk" column
    expect(bad).toMatchObject({ pass: false, calProteinOk: false });
    expect(bad.problems[0]).toContain('calories 210');
  });
  it('fails a percent of Daily Value read as an amount, an invented amount and a wrong amount, and only notes what was left out', () => {
    expect(compareLabel(ok({ micro: { vitaminA: 10 } }), spec).problems[0]).toContain('percent of Daily Value read as an amount');
    expect(compareLabel(ok({ micro: { magnesium: 40 } }), spec).problems[0]).toContain('invented');
    expect(compareLabel(ok({ micro: { calcium: 13 } }), spec).problems[0]).toContain('calcium 13, label says 130');
    const left = compareLabel(ok({ micro: { calcium: 130 } }), spec);
    expect(left.pass).toBe(true);
    expect(left.notes.join(' ')).toContain('left out (safe): iron, folate');
  });
  it('takes either of two printed amounts (folate as DFE or as folic acid)', () => {
    expect(compareLabel(ok({ micro: { folate: 200 } }), spec).pass).toBe(true);
    expect(compareLabel(ok({ micro: { folate: 150 } }), spec).pass).toBe(false);
  });
  it('treats only per 100 g and unreadable as failures unless the label allows them', () => {
    expect(compareLabel({ kind: 'per100g' }, spec)).toMatchObject({ pass: false, calProteinOk: false });
    expect(compareLabel({ kind: 'per100g' }, { ...spec, allowPer100g: true })).toMatchObject({ pass: true, calProteinOk: true }); // a right answer, so it is not a miss
    expect(compareLabel({ kind: 'unreadable' }, spec).pass).toBe(false);
  });
  it('holds protein to half a gram or 5% and amounts to 10% (a 3 g label does not pass at 3.6 g, 0.2 mg does not pass at 0.25 mg)', () => {
    const tight = { kind: 'label', kcal: 100, p: 3, micro: { thiamin: 0.2 } };
    expect(compareLabel({ kind: 'ok', label: { kcal: 100, p: 3.6 } }, tight).calProteinOk).toBe(false);
    expect(compareLabel({ kind: 'ok', label: { kcal: 100, p: 3.4 } }, tight).calProteinOk).toBe(true);
    expect(compareLabel({ kind: 'ok', label: { kcal: 100, p: 3, micro: { thiamin: 0.25 } } }, tight).pass).toBe(false);
    expect(compareLabel({ kind: 'ok', label: { kcal: 100, p: 3, micro: { thiamin: 0.21 } } }, tight).pass).toBe(true);
  });
  it('accepts another printed pair of calories and protein (a column with milk added)', () => {
    const s = { ...spec, alt: [{ kcal: 263, p: 9.8 }] };
    expect(compareLabel({ kind: 'ok', label: { kcal: 263, p: 9.8 } }, s).pass).toBe(true);
  });
  it('requires a photo that is not a label to be refused, and lets a blurred one be refused or read correctly', () => {
    const not = { kind: 'notLabel' };
    expect(compareLabel({ kind: 'unreadable' }, not).pass).toBe(true);
    expect(compareLabel(ok({}), not).pass).toBe(false);
    const blur = { ...spec, kind: 'blurred' };
    expect(compareLabel({ kind: 'unreadable' }, blur).pass).toBe(true);
    expect(compareLabel(ok({}), blur).pass).toBe(true);
    expect(compareLabel({ kind: 'ok', label: { kcal: 40, p: 1 } }, blur).pass).toBe(false);
  });
});

describe('summarize', () => {
  const row = (kind: string, r: ReturnType<typeof compareLabel>) => ({ spec: { kind }, ...r });
  const good = compareLabel(ok({}), spec);
  const miss = compareLabel({ kind: 'ok', label: { kcal: 210, p: 5 } }, spec);
  const wrongAmount = compareLabel(ok({ micro: { vitaminA: 10 } }), spec);
  const refused = compareLabel({ kind: 'unreadable' }, { kind: 'notLabel' });
  const twelve = (...bad: ReturnType<typeof compareLabel>[]) => [...bad, ...Array.from({ length: 12 - bad.length }, () => good)].map(r => row('label', r));

  it('allows one miss in 12 real labels (9 of 10, rounded down) and passes when nothing else is wrong', () => {
    expect(summarize([...twelve(miss), row('notLabel', refused)])).toMatchObject({ real: 12, calOk: 11, allowedMisses: 1, microProblems: 0, pass: true });
  });
  it('fails on two misses, on any wrong or invented amount, and on a non-label that was read', () => {
    expect(summarize(twelve(miss, miss)).pass).toBe(false);
    expect(summarize(twelve(wrongAmount)).pass).toBe(false);
    expect(summarize([...twelve(), row('notLabel', compareLabel(ok({}), { kind: 'notLabel' }))]).pass).toBe(false);
  });
  it('allows no miss with fewer than 10 real labels, and one with 10', () => {
    expect(summarize(Array.from({ length: 9 }, () => row('label', good)).concat(row('label', miss))).allowedMisses).toBe(1);
    expect(summarize([row('label', miss), ...Array.from({ length: 8 }, () => row('label', good))])).toMatchObject({ allowedMisses: 0, pass: false });
  });
  it('counts a correct per-100 g answer as right, so it never uses up the one allowed miss', () => {
    const per100 = compareLabel({ kind: 'per100g' }, { kind: 'label', kcal: 1, p: 1, allowPer100g: true });
    expect(summarize([...twelve(miss).slice(0, 11), row('label', per100)])).toMatchObject({ real: 12, calOk: 11, pass: true });
  });
  it('is INCOMPLETE, never PASS, when no real label was checked or an expected photo was not run', () => {
    expect(summarize([])).toMatchObject({ pass: false, verdict: 'INCOMPLETE', real: 0 });
    const ran = twelve().map((r, i) => ({ ...r, name: `p${i}.jpg` }));
    const names = ran.map(r => r.name);
    expect(summarize(ran, names)).toMatchObject({ pass: true, verdict: 'PASS', unrun: [] });
    expect(summarize(ran, [...names, 'missing.jpg'])).toMatchObject({ pass: false, verdict: 'INCOMPLETE', unrun: ['missing.jpg'] });
  });
  it('does not blame a failed scan call on a wrong amount', () => {
    const failed = { spec: { kind: 'label' }, pass: false, calProteinOk: false, problems: ['the scan call failed'], notes: [] };
    expect(summarize([failed])).toMatchObject({ microProblems: 0, calOk: 0 });
  });
});
