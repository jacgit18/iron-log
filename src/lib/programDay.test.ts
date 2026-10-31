import { describe, expect, it } from 'vitest';
import type { Program, ProgramSlot } from '../types.ts';
import { boardNote, copyDaySlots, onBoardKeys } from './programDay';

const slot = (id: string, over: Partial<ProgramSlot> = {}): ProgramSlot => ({ id, sec: 'Regular', type: 'single', items: [{ ex: 'squat', ph: 'strength', w: null, rx: '3 × 8' }], ...over });
const prog = (slots: ProgramSlot[]): Program => ({ days: [{ title: 'Day 1', slots }], key: 'A' });

describe('copyDaySlots', () => {
  it('copies every card with a new id and leaves the originals alone', () => {
    const src = [slot('A-d1s1'), slot('A-d1s2', { type: 'superset', items: [{ ex: 'a', ph: null, w: null }, { ex: 'b', ph: null, w: null }] })];
    const out = copyDaySlots(src, i => `N-x${i}`);
    expect(out.map(s => s.id)).toEqual(['N-x0', 'N-x1']);
    expect(out[1]!.items).toHaveLength(2); // a superset stays one card
    expect(out[0]!.items).toEqual(src[0]!.items);
    expect(out[0]!.items).not.toBe(src[0]!.items); // its own items, so editing one never edits the other
    expect(src.map(s => s.id)).toEqual(['A-d1s1', 'A-d1s2']);
  });
  it('keeps what makes a card the same card: section, start week, note', () => {
    const out = copyDaySlots([slot('x', { sec: 'Home', from: '2026-09-20', note: 'slow' })], () => 'y');
    expect(out[0]).toMatchObject({ id: 'y', sec: 'Home', from: '2026-09-20', note: 'slow' });
  });
  it('an empty day copies to nothing', () => { expect(copyDaySlots([], () => 'x')).toEqual([]); });
});

describe('onBoardKeys and boardNote', () => {
  const a = prog([slot('1')]); const b = prog([slot('2')]);
  it('finds the program or programs on the Board that hold the same cards', () => {
    expect(onBoardKeys(a, { A: a, B: b })).toEqual(['A']);
    expect(onBoardKeys(structuredClone(a), { A: a, B: a })).toEqual(['A', 'B']);
    expect(onBoardKeys(prog([slot('9')]), { A: a, B: b })).toEqual([]);
  });
  it('says it in words', () => {
    expect(boardNote(['Program A'])).toBe('On your Board: Program A');
    expect(boardNote(['Program A', 'Winter'])).toBe('On your Board: Program A and Winter');
    expect(boardNote([])).toBe('Not on your Board');
  });
});
