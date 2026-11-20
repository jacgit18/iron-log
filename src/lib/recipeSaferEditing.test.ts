import { describe, expect, it } from 'vitest';
import { afterAmount, backAction, foldedSummary, isEdited, isFolded, landsAt, nextUnfinished, offersUndo, removeRow, restoreRow, rowDone, type EditRow } from './recipeSaferEditing.js';

const r = (n: string, amt = '', more: Partial<EditRow> = {}): EditRow => ({ n, amt, ...more });
const blank = () => r('');

describe('rowDone', () => {
  it('needs a name and an amount', () => {
    expect(rowDone(r('Rice', '1 cup'))).toBe(true);
    expect(rowDone(r('Rice'))).toBe(false);
    expect(rowDone(r('', '1 cup'))).toBe(false);
    expect(rowDone(r('  ', '  '))).toBe(false);
  });
  it('counts a linked food or meal as done once named, and a linked sauce once it has an amount', () => {
    expect(rowDone(r('Pack', '', { rid: 'a', q: 2 }))).toBe(true);
    expect(rowDone(r('Soy sauce', '', { rid: 'a' }))).toBe(false);
    expect(rowDone(r('Soy sauce', '1 tbsp', { rid: 'a' }))).toBe(true);
  });
});

describe('nextUnfinished and afterAmount', () => {
  const rows = [r('A', '1'), r('B'), r('C', '2'), r('')];
  it('finds the first unfinished row after a place', () => {
    expect(nextUnfinished(rows)).toBe(1);
    expect(nextUnfinished(rows, 1)).toBe(3);
    expect(nextUnfinished(rows, 3)).toBeNull();
  });
  it('moves to the next unfinished row, wraps to an earlier one, else Save', () => {
    expect(afterAmount(rows, 0)).toEqual({ kind: 'row', i: 1 });
    expect(afterAmount([r('A', '1'), r('B')], 0)).toEqual({ kind: 'row', i: 1 });
    expect(afterAmount([r('A'), r('B', '1')], 1)).toEqual({ kind: 'row', i: 0 });
    expect(afterAmount([r('A', '1'), r('B', '2')], 1)).toEqual({ kind: 'save' });
  });
});

describe('isFolded', () => {
  it('folds a finished row that is not being edited', () => {
    expect(isFolded(r('A', '1'), 0, null)).toBe(true);
    expect(isFolded(r('A', '1'), 0, 0)).toBe(false);
    expect(isFolded(r('A'), 0, null)).toBe(false);
  });
});

describe('foldedSummary', () => {
  it('reads name and amount', () => expect(foldedSummary(r('Chicken breast', '200 g'), '200 g')).toBe('Chicken breast · 200 g'));
  it('leaves out a missing amount and adds Alternative and skipped', () => {
    expect(foldedSummary(r('Soy sauce', '', { rid: 'x', q: 1 }), '')).toBe('Soy sauce');
    expect(foldedSummary(r('Rice', '1 cup', { sub: 'Quinoa', skip: true }), '1 cup')).toBe('Rice · 1 cup (or Quinoa) · skipped');
  });
});

describe('backAction', () => {
  it('closes the picker first, whatever else is true', () => {
    expect(backAction({ edited: true, pickerOpen: true, asking: false })).toBe('close-picker');
    expect(backAction({ edited: false, pickerOpen: true, asking: false })).toBe('close-picker');
  });
  it('asks when there are edits or the question shows, else leaves', () => {
    expect(backAction({ edited: true, pickerOpen: false, asking: false })).toBe('ask');
    expect(backAction({ edited: false, pickerOpen: false, asking: true })).toBe('ask');
    expect(backAction({ edited: false, pickerOpen: false, asking: false })).toBe('leave');
  });
  it('compares snapshots', () => {
    expect(isEdited('a', 'a')).toBe(false);
    expect(isEdited('a', 'b')).toBe(true);
  });
});

describe('remove and undo', () => {
  const rows = [r('A', '1'), r('B', '2'), r('C', '3')];
  it('brings a removed row back in its place', () => {
    const out = removeRow(rows, 1, blank);
    expect(out.rows.map(x => x.n)).toEqual(['A', 'C']);
    expect(restoreRow(out.rows, out.removed!, 10)!.map(x => x.n)).toEqual(['A', 'B', 'C']);
  });
  it('puts the last row back at the end when the list is shorter now', () => {
    const out = removeRow(rows, 2, blank);
    expect(restoreRow([r('A', '1')], out.removed!, 10)!.map(x => x.n)).toEqual(['A', 'C']);
  });
  it('offers no undo for a blank row', () => {
    expect(offersUndo(blank())).toBe(false);
    expect(removeRow([r('A', '1'), blank()], 1, blank).removed).toBeNull();
  });
  it('replaces a lone row with an empty one and restores over it', () => {
    const out = removeRow([r('A', '1')], 0, blank);
    expect(out.rows).toEqual([blank()]);
    expect(restoreRow(out.rows, out.removed!, 10)!.map(x => x.n)).toEqual(['A']);
  });
  it('refuses when the list is full again', () => {
    const out = removeRow(rows, 0, blank);
    expect(restoreRow([r('X', '1'), r('Y', '1'), r('Z', '1')], out.removed!, 3)).toBeNull();
  });
  it('ignores an index that is not there', () => {
    expect(removeRow(rows, 9, blank)).toEqual({ rows, removed: null });
  });
});

describe('landsAt', () => {
  it('fills the empty last row, else adds at the end', () => {
    expect(landsAt([r('A', '1'), blank()])).toBe(1);
    expect(landsAt([r('A', '1')])).toBe(1);
    expect(landsAt([r('A', '1'), r('', '', { sub: 'x' })])).toBe(2);
    expect(landsAt([])).toBe(0);
  });
});
