import { describe, it, expect } from 'vitest';
import type { FlatSlot } from '../types.ts';
import { finishedPills, finishedRows } from './finishedGroup.js';

const slot = (id: string, type: FlatSlot['type'], exs: string[]): FlatSlot => ({ id, type, day: 1, sec: 'Main', items: exs.map(ex => ({ ex })) }) as unknown as FlatSlot;

describe('finishedRows', () => {
  it('gives a done single card one row that acts on the whole card', () => {
    const s = slot('a', 'single', ['squat']);
    expect(finishedRows([s], { done: { a: true } })).toEqual([{ key: 'a', slotId: 'a', idx: 0, kind: 'done', whole: true, exs: ['squat'], join: ' → ' }]);
  });

  it('gives a skipped single card one skipped row', () => {
    const s = slot('a', 'single', ['squat']);
    expect(finishedRows([s], { skipped: { a: true } }).map(r => [r.kind, r.whole])).toEqual([['skipped', true]]);
  });

  it('gives a superset one row per done exercise, each acting on its own exercise', () => {
    const s = slot('b', 'superset', ['curl', 'pushdown']);
    const rows = finishedRows([s], { done: { b: true } });
    expect(rows.map(r => [r.idx, r.kind, r.whole, r.exs])).toEqual([[0, 'done', false, ['curl']], [1, 'done', false, ['pushdown']]]);
  });

  it('shows a skipped exercise of a done superset as its own skipped row', () => {
    const s = slot('b', 'superset', ['curl', 'pushdown']);
    const rows = finishedRows([s], { done: { 'b#0': true }, skipped: { 'b#1': true } });
    expect(rows.map(r => [r.idx, r.kind])).toEqual([[0, 'done'], [1, 'skipped']]);
  });

  it('gives a superset skipped as a whole one row naming every exercise', () => {
    const s = slot('b', 'superset', ['curl', 'pushdown']);
    const rows = finishedRows([s], { skipped: { b: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'skipped', whole: true, exs: ['curl', 'pushdown'], join: ' → ' });
  });

  it('gives a superset skipped one exercise at a time one skipped row per exercise', () => {
    const s = slot('b', 'superset', ['curl', 'pushdown']);
    const rows = finishedRows([s], { skipped: { 'b#0': true, 'b#1': true } });
    expect(rows.map(r => [r.idx, r.kind, r.whole])).toEqual([[0, 'skipped', false], [1, 'skipped', false]]);
  });

  it('shows only the picked option of a done either/or card', () => {
    const s = slot('c', 'either', ['row', 'pulldown']);
    expect(finishedRows([s], { done: { 'c#1': true } }).map(r => [r.idx, r.exs])).toEqual([[1, ['pulldown']]]);
  });

  it('keeps the order of the cards it is given', () => {
    const a = slot('a', 'single', ['squat']); const b = slot('b', 'single', ['rdl']);
    expect(finishedRows([b, a], { done: { a: true, b: true } }).map(r => r.slotId)).toEqual(['b', 'a']);
  });
});

describe('finishedPills', () => {
  it('names each count that is not zero', () => {
    expect(finishedPills({ done: 2, skipped: 1 })).toEqual([{ kind: 'done', text: '2 done' }, { kind: 'skipped', text: '1 skipped' }]);
    expect(finishedPills({ done: 0, skipped: 3 })).toEqual([{ kind: 'skipped', text: '3 skipped' }]);
    expect(finishedPills({ done: 0, skipped: 0 })).toEqual([]);
  });
});
