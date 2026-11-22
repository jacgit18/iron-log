import { describe, expect, it } from 'vitest';
import type { PlanItem, Recipe, RepeatItem } from '../types.ts';
import { parseTrayOpen, splitMeal, trayOpenWith, trayRows } from './availableTray.js';
import { handyTrays } from './repeats.js';
import { boardDay } from './weekBoard.js';

const rec = (id: string, n: string): Recipe => ({ id, n, cat: 'ready', ing: [], steps: [], kcal: 100, p: 5, meal: 'snack' }) as unknown as Recipe;
const rs = [rec('a', 'Almonds'), rec('b', 'Banana'), rec('c', 'Chia pudding'), rec('d', 'Dates')];
const D = '2026-11-20';
const items = (...l: PlanItem[]) => boardDay({ [D]: l }, D, rs, [], null).slots.find(s => s.slot === 'snack')!.items;

describe('splitMeal: the plate and the tray', () => {
  it('planned and eaten items are on the plate, every other item is Available', () => {
    const x = items({ k: 'r', id: 'a', s: 'snack', p: true }, { k: 'r', id: 'b', s: 'snack' }, { k: 'r', id: 'c', s: 'snack', e: ['e1'] }, { k: 'r', id: 'd', s: 'snack' });
    const { plate, tray } = splitMeal(x, [{ id: 'e1' }]);
    expect(plate.map(i => i.r.name)).toEqual(['Almonds', 'Chia pudding']);
    expect(tray.map(i => i.r.name)).toEqual(['Banana', 'Dates']);
  });
  it('an eaten item stays on the plate whether it was planned or not, and an eaten mark whose entry is gone is Available again', () => {
    const x = items({ k: 'r', id: 'a', s: 'snack', p: true, e: ['e1'] }, { k: 'r', id: 'b', s: 'snack', e: ['gone'] });
    const { plate, tray } = splitMeal(x, [{ id: 'e1' }]);
    expect(plate.map(i => i.r.name)).toEqual(['Almonds']);
    expect(tray.map(i => i.r.name)).toEqual(['Banana']);
  });
  it('an item whose food was removed stays on the plate so it can be taken off', () => {
    const x = items({ k: 'r', id: 'zz', s: 'snack' });
    expect(splitMeal(x, []).plate).toHaveLength(1);
  });
  it('loses nothing and repeats nothing: plate and tray together are the meal\'s items', () => {
    const x = items({ k: 'r', id: 'a', s: 'snack', p: true }, { k: 'r', id: 'b', s: 'snack' }, { k: 'r', id: 'c', s: 'snack', e: ['e1'] });
    const { plate, tray } = splitMeal(x, [{ id: 'e1' }]);
    expect([...plate, ...tray].map(i => i.index).sort()).toEqual(x.map(i => i.index).sort());
  });
});

describe('trayRows: stored items and Keep handy foods in one list', () => {
  const handyRep: RepeatItem = { rid: 'h1', k: 'r', id: 'c', s: 'snack', days: [0, 1, 2, 3, 4, 5, 6], from: '2026-11-01', h: true };
  it('joins both sources A to Z and tags the handy row', () => {
    const tray = splitMeal(items({ k: 'r', id: 'd', s: 'snack' }, { k: 'r', id: 'a', s: 'snack' }), []).tray;
    const handy = handyTrays(D, { [D]: [] }, [handyRep], undefined, D, rs, []).snack ?? [];
    const rows = trayRows(tray, handy);
    expect(rows.map(r => [r.name, r.handy])).toEqual([['Almonds', false], ['Chia pudding', true], ['Dates', false]]);
    expect(rows[1]!.rid).toBe('h1');
  });
  it('a handy food already added to the day is a stored item, not a second row', () => {
    const added = items({ k: 'r', id: 'c', s: 'snack' });
    const handy = handyTrays(D, { [D]: [{ k: 'r', id: 'c', s: 'snack' }] }, [handyRep], undefined, D, rs, []).snack ?? [];
    expect(trayRows(splitMeal(added, []).tray, handy).map(r => r.name)).toEqual(['Chia pudding']);
  });
  it('is empty with nothing', () => expect(trayRows([], [])).toEqual([]));
});

describe('the remembered open state', () => {
  it('reads nothing, junk and the wrong shapes as all closed', () => {
    for (const raw of [null, undefined, '', 'nope', '[]', '5', '{"lunch":"yes"}']) expect(parseTrayOpen(raw)).toEqual({});
  });
  it('opens and closes one meal at a time, keeping the others, and drops unknown meals', () => {
    const a = trayOpenWith(null, 'lunch', true), b = trayOpenWith(a, 'snack', true);
    expect(parseTrayOpen(b)).toEqual({ lunch: true, snack: true });
    expect(parseTrayOpen(trayOpenWith(b, 'lunch', false))).toEqual({ snack: true });
    expect(parseTrayOpen('{"brunch":true,"dinner":true}')).toEqual({ dinner: true });
  });
});
