import { describe, it, expect } from 'vitest';
import { DEFAULT_CFG } from './logic.js';
import { historyRows, weekRowLabel } from './historyRows.js';
import { parseDate } from '../shared/dates.js';
import type { Cfg, Program, Week } from '../types.ts';

const cfg = { ...structuredClone(DEFAULT_CFG) } as unknown as Cfg;
// Day 1: a, b (superset of 2)   Day 2: c   Day 3: d (either/or)   Days 4 to 6 empty
const prog = (key: string) => ({ key, days: [
  { slots: [{ id: 'a', items: [{ ex: 'hack' }] }, { id: 'b', type: 'superset', items: [{ ex: 'hipthrust' }, { ex: 'chestpress' }] }] },
  { slots: [{ id: 'c', items: [{ ex: 'legext' }] }] },
  { slots: [{ id: 'd', type: 'either', items: [{ ex: 'farmers' }, { ex: 'dblunge' }] }] },
  { slots: [] }, { slots: [] }, { slots: [] },
] }) as unknown as Program;
const programs = { A: prog('A'), B: prog('B') };

const empty = (): Week => ({ done: {}, skipped: {}, moved: {} }) as unknown as Week;
const one = (): Week => ({ done: { a: true, 'b#0': true, 'b#1': true, d: true }, skipped: {}, moved: {} }) as unknown as Week; // days 1 and 3 complete
const today = parseDate('2026-10-07'); // a Wednesday: this week starts Sunday 2026-10-04
const NOW = '2026-10-04';

describe('historyRows: what the Weekly history panel shows', () => {
  it('shows only this week when nothing was ever done', () => {
    const { rows, summary } = historyRows(cfg, programs, {}, empty(), NOW, today, 12);
    expect(rows.map(r => r.key)).toEqual([NOW]);
    expect(rows[0].isNow).toBe(true);
    expect(summary).toBeNull(); // no past week
  });

  it('runs from the earliest week with an exercise done to this week, newest first', () => {
    const { rows } = historyRows(cfg, programs, { '2026-09-13': one() }, empty(), NOW, today, 12);
    expect(rows.map(r => r.key)).toEqual([NOW, '2026-09-27', '2026-09-20', '2026-09-13']);
  });

  it('caps the range at maxWeeks, keeping the newest', () => {
    const { rows } = historyRows(cfg, programs, { '2026-09-13': one() }, empty(), NOW, today, 2);
    expect(rows.map(r => r.key)).toEqual([NOW, '2026-09-27']);
  });

  it('counts a week with no saved record as an empty week', () => {
    const { rows } = historyRows(cfg, programs, { '2026-09-13': one() }, empty(), NOW, today, 12);
    const gap = rows.find(r => r.key === '2026-09-27');
    expect(gap).toMatchObject({ full: 0, ex: 0, isNow: false });
    expect(gap?.days).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('ignores weeks after this week and keys that are not weeks', () => {
    const { rows } = historyRows(cfg, programs, { '2026-10-11': one(), nope: one() }, empty(), NOW, today, 12);
    expect(rows.map(r => r.key)).toEqual([NOW]);
  });

  it('uses the live shown week over the saved copy', () => {
    const { rows } = historyRows(cfg, programs, { [NOW]: empty() }, one(), NOW, today, 12);
    expect(rows[0]).toMatchObject({ key: NOW, isNow: true, full: 2 });
  });

  it('summarises the past weeks only: goal met, average, exercises per training day', () => {
    const hist = { '2026-09-20': one(), '2026-09-27': empty() };
    const { summary } = historyRows(cfg, programs, hist, one(), NOW, today, 12);
    expect(summary).toMatchObject({ met: 0, pastCount: 2, mean: '1.0' });
    expect(summary?.perDay).toBeCloseTo(2, 5); // four exercises done (a, both halves of b, d) over two training days
  });

  it('shows a week that loaded but has no exercises as it is', () => {
    const { rows } = historyRows(cfg, programs, { '2026-09-20': one(), '2026-09-27': empty() }, empty(), NOW, today, 12);
    expect(rows.find(r => r.key === '2026-09-27')).toMatchObject({ full: 0, ex: 0 });
  });

  it('works with the saved weeks not loaded at all', () => {
    const { rows } = historyRows(cfg, programs, null, one(), NOW, today, 12);
    expect(rows.map(r => r.key)).toEqual([NOW]);
  });
});

describe('weekRowLabel', () => {
  it('names each day and the total', () => {
    expect(weekRowLabel(1, [2, 1, 0, 0, 0, 0, 0])).toBe('1 of 7 days complete: day 1 complete, day 2 partly done, day 3 not started, day 4 not started, day 5 not started, day 6 not started, day 7 not started');
  });
});
