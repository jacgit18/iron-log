import { describe, expect, it } from 'vitest';
import type { PhaseKey, Program, ProgramDay, ProgramItem } from '../types.ts';
import { compareDay, compareProgram, countRows, diffParts, filterRows, itemLine, phaseMix, rowTag } from './programCompare.js';

const it_ = (ex: string, w: number | null, rx: string, ph: PhaseKey | null = 'hyp'): ProgramItem => ({ ex, ph, w, rx });
const day = (...items: ProgramItem[][]): ProgramDay => ({ title: 'D', slots: items.map((x, i) => ({ id: `s${i}`, items: x })) });
const one = (...x: ProgramItem[]) => day(...x.map(i => [i]));
const status = (a: ProgramDay, b: ProgramDay) => compareDay(a, b).map(r => `${r.ex}:${r.status}`);

describe('compareDay', () => {
  it('labels same, changed, phase only, and only-in rows', () => {
    const a = one(it_('Squat', 100, '3×8'), it_('Row', 50, '3×10'), it_('Press', 40, '3×8'), it_('Curl', 20, '3×12'));
    const b = one(it_('Squat', 100, '3×8'), it_('Row', 55, '3×10'), it_('Press', 40, '3×8', 'strength'), it_('Dip', null, '3×8'));
    expect(status(a, b)).toEqual(['Squat:same', 'Row:chg', 'Press:ph', 'Curl:onlyA', 'Dip:onlyB']);
  });
  it('matches names ignoring case and spaces, and flags the phase on a changed row too', () => {
    const r = compareDay(one(it_('Squat', 100, '3×8')), one(it_(' squat ', 105, '3×8', 'strength')))[0]!;
    expect(r.status).toBe('chg');
    expect(r.phDiff).toBe(true);
  });
  it('compares each exercise of a superset and keeps a bodyweight move apart from a loaded one', () => {
    const a = day([it_('A', 10, '3×8'), it_('B', 20, '3×8')]);
    const b = day([it_('A', 10, '3×8'), { ex: 'B', ph: 'hyp', w: null, bw: true, rx: '3×8' }]);
    expect(status(a, b)).toEqual(['A:same', 'B:chg']);
  });
  it('pairs a repeated name in order and leaves the extra as only-in', () => {
    const a = one(it_('Squat', 100, '3×8'), it_('Squat', 80, '3×12'));
    expect(status(a, one(it_('Squat', 100, '3×8')))).toEqual(['Squat:same', 'Squat:onlyA']);
    expect(status(one(it_('Squat', 100, '3×8')), a)).toEqual(['Squat:same', 'Squat:onlyB']);
  });
  it('treats a missing or empty day as nothing', () => {
    expect(compareDay(undefined, undefined)).toEqual([]);
    expect(status(day(), one(it_('Squat', 1, '1×1')))).toEqual(['Squat:onlyB']);
  });
  it('an exercise moved to another day is only-in on both days', () => {
    const a = { days: [one(it_('Squat', 1, '1×1')), day()] } as unknown as Program;
    const b = { days: [day(), one(it_('Squat', 1, '1×1'))] } as unknown as Program;
    expect(compareProgram(a, b).map(d => d.map(r => r.status))).toEqual([['onlyA'], ['onlyB']]);
  });
});

describe('filterRows and countRows', () => {
  const rows = compareDay(
    one(it_('Squat', 100, '3×8'), it_('Row', 50, '3×10'), it_('Press', 40, '3×8'), it_('Curl', 20, '3×12', null)),
    one(it_('Squat', 100, '3×8'), it_('Row', 55, '3×10'), it_('Press', 40, '3×8', 'strength')),
  );
  it('counts the unfiltered rows', () => {
    expect(countRows(rows)).toEqual({ same: 1, chg: 1, ph: 1, onlyA: 1, onlyB: 0, diff: 3, all: 4 });
  });
  it('filters by status', () => {
    expect(filterRows(rows, 'all', null)).toHaveLength(4);
    expect(filterRows(rows, 'diff', null).map(r => r.ex)).toEqual(['Row', 'Press', 'Curl']);
    expect(filterRows(rows, 'ph', null).map(r => r.ex)).toEqual(['Press']);
  });
  it('filters by phase on either side, and by no phase', () => {
    expect(filterRows(rows, 'all', 'strength').map(r => r.ex)).toEqual(['Press']);
    expect(filterRows(rows, 'all', 'hyp').map(r => r.ex)).toEqual(['Squat', 'Row', 'Press']);
    expect(filterRows(rows, 'all', 'none').map(r => r.ex)).toEqual(['Curl']);
  });
  it('combines the two filters', () => {
    expect(filterRows(rows, 'chg', 'strength')).toEqual([]);
  });
});

describe('text helpers', () => {
  it('itemLine matches the editor row text', () => {
    expect(itemLine(it_('X', 85, '3×8'))).toBe('Hypertrophy · 85 lb · 3×8');
    expect(itemLine({ ex: 'X', ph: null, w: null, bw: true, rx: '3×8' })).toBe('No phase · bodyweight · 3×8');
  });
  it('diffParts says which parts differ, so both sides can mark them', () => {
    const [both] = compareDay(one(it_('X', 80, '3×8')), one(it_('X', 85, '3×8', 'strength')));
    expect(diffParts(both!)).toEqual({ load: true, phase: true });
    const [loadOnly] = compareDay(one(it_('X', 80, '3×8')), one(it_('X', 85, '3×8')));
    expect(diffParts(loadOnly!)).toEqual({ load: true, phase: false });
    const [phaseOnly] = compareDay(one(it_('X', 80, '3×8')), one(it_('X', 80, '3×8', 'strength')));
    expect(diffParts(phaseOnly!)).toEqual({ load: false, phase: true });
    const [same] = compareDay(one(it_('X', 80, '3×8')), one(it_('X', 80, '3×8')));
    expect(diffParts(same!)).toEqual({ load: false, phase: false });
    const [onlyHere] = compareDay(one(it_('X', 80, '3×8')), one());
    expect(diffParts(onlyHere!)).toEqual({ load: false, phase: false });
  });
  it('rowTag names the status, and the program for an only-in row', () => {
    const rows = compareDay(one(it_('Same', 1, '1×1'), it_('Chg', 1, '1×1'), it_('Ph', 1, '1×1'), it_('Away', 1, '1×1')), one(it_('Same', 1, '1×1'), it_('Chg', 2, '1×1'), it_('Ph', 1, '1×1', 'strength'), it_('Here', 1, '1×1')));
    expect(rows.map(r => rowTag(r, 'Push', 'Pull'))).toEqual(['Same', 'Changed', 'Phase differs', 'Only in Push', 'Only in Pull']);
  });
  it('phaseMix counts exercises per phase across all days', () => {
    const p = { days: [one(it_('A', 1, '1×1'), it_('B', 1, '1×1', 'strength')), one(it_('C', 1, '1×1', null))] } as unknown as Program;
    expect(phaseMix(p)).toMatchObject({ hyp: 1, strength: 1, none: 1, iso: 0 });
  });
});
