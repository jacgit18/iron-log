import { describe, it, expect } from 'vitest';
import { DEFAULT_CFG, ranFor, weekProgKey, weekProgram } from './logic.js';
import { weekSummary } from './trends.js';
import { normWeek } from '../shared/week.js';
import { mergeWeek } from './export.js';

// ADR 022: a week that is over is counted from its own record of what it ran, not from today's programs and mode.
const cfg = (over = {}) => ({ ...structuredClone(DEFAULT_CFG), ...over });
const prog = (key, ids) => ({ key, days: [
  { slots: ids.map(id => ({ id, items: [{ ex: 'hack' }] })) },
  { slots: [] }, { slots: [] }, { slots: [] }, { slots: [] }, { slots: [] }, { slots: [] },
] });
const PAST = '2026-01-04'; // a Sunday long gone
const week = (over = {}) => normWeek({ done: { a: true, b: true }, ...over });

describe('ranFor: what a week writes down', () => {
  it('writes each card with its id, positions included, and leaves out cards that start later', () => {
    const p = { key: 'A', days: [{ slots: [{ items: [{ ex: 'hack' }] }, { id: 'late', from: '2026-02-01', items: [{ ex: 'dip' }] }] }, ...prog('A', []).days.slice(1)] };
    const r = ranFor(p, 'A', week(), PAST);
    expect(r.prog).toBe('A');
    expect(r.program.days[0].slots.map(s => s.id)).toEqual(['A-d1s1']);
  });
  it('keeps a card the week ticked after it left the program, so the week still counts it', () => {
    const w = week({ done: { a: true, 'b#1': true } });
    w.ran = ranFor(prog('A', ['a', 'b', 'c']), 'A', w, PAST);
    const again = ranFor(prog('A', ['c']), 'A', w, PAST); // a and b were removed mid-week
    expect(again.program.days[0].slots.map(s => s.id)).toEqual(['c', 'a', 'b']);
    w.done = { a: true }; w.ran = again;
    expect(ranFor(prog('A', ['c']), 'A', w, PAST).program.days[0].slots.map(s => s.id)).toEqual(['c', 'a']); // b has nothing this week: gone
  });
});

describe('a week that is over keeps its numbers', () => {
  const recorded = () => { const w = week(); w.ran = ranFor(prog('A', ['a', 'b', 'c']), 'A', w, PAST); return w; };

  it('loading another program into A does not empty it', () => {
    const before = weekSummary(cfg(), { A: prog('A', ['a', 'b', 'c']), B: prog('B', []) }, PAST, recorded());
    const after = weekSummary(cfg(), { A: prog('A', ['x', 'y']), B: prog('B', []) }, PAST, recorded());
    expect(before).toMatchObject({ ex: 2, total: 3 });
    expect(after).toMatchObject({ ex: 2, total: 3, pk: 'A' });
  });
  it('changing the mode does not move it to the other program', () => {
    const programs = { A: prog('A', ['a', 'b', 'c']), B: prog('B', ['z']) };
    const r = weekSummary(cfg({ mode: 2, m2Even: 'A' }), programs, PAST, recorded()); // January is odd: mode 2 would say B
    expect(r).toMatchObject({ pk: 'A', ex: 2, total: 3 });
  });
  it('a week with no record (saved before ADR 022) still follows today’s programs', () => {
    const w = week();
    expect(weekProgram(cfg(), { A: prog('A', ['x']), B: prog('B', []) }, w, PAST).days[0].slots[0].id).toBe('x');
  });
  it('this week follows today’s programs even with a record, so edits show on the board', () => {
    const now = new Date(2026, 0, 6); // the Tuesday of week PAST
    const w = recorded();
    expect(weekProgram(cfg(), { A: prog('A', ['x']), B: prog('B', []) }, w, PAST, now).days[0].slots[0].id).toBe('x');
    expect(weekProgKey(cfg({ mode: 2, m2Even: 'A' }), w, PAST, now)).toBe('B');
  });
});

describe('normWeek keeps a valid record and drops a bad one', () => {
  it('keeps the program key and a cleaned program', () => {
    const w = normWeek({ done: {}, ran: { prog: 'B', program: prog('B', ['a']) } });
    expect(w.ran.prog).toBe('B');
    expect(w.ran.program.key).toBe('B');
    expect(w.ran.program.days[0].slots[0]).toMatchObject({ id: 'a', items: [{ ex: 'hack' }] });
  });
  it('drops a record with a bad key or a program of the wrong shape', () => {
    expect(normWeek({ ran: { prog: 'C', program: prog('A', ['a']) } })).not.toHaveProperty('ran');
    expect(normWeek({ ran: { prog: 'A', program: { days: 'no' } } })).not.toHaveProperty('ran');
    expect(normWeek({ ran: 'x' })).not.toHaveProperty('ran');
  });
});

describe('merging a week keeps what it ran', () => {
  const ran = (key, ids) => ({ prog: key, program: prog(key, ids) });

  it('takes the other side’s record when this side has none', () => {
    expect(mergeWeek({ done: { a: true } }, { done: { b: true }, ran: ran('B', ['a', 'b']) }).ran.prog).toBe('B');
  });
  it('keeps this side’s record, adding the other’s ticked cards when both ran the same program', () => {
    const m = mergeWeek({ done: { a: true }, ran: ran('A', ['a']) }, { done: { 'b#0': true }, ran: ran('A', ['b', 'c']) });
    expect(m.ran.program.days[0].slots.map(s => s.id)).toEqual(['a', 'b']); // c has nothing this week
  });
  it('keeps this side’s record alone when the other ran the other program', () => {
    const m = mergeWeek({ done: { a: true }, ran: ran('A', ['a']) }, { done: { b: true }, ran: ran('B', ['b']) });
    expect(m.ran).toMatchObject({ prog: 'A' });
    expect(m.ran.program.days[0].slots.map(s => s.id)).toEqual(['a']);
  });
});
