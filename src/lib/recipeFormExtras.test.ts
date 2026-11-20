import { describe, expect, it } from 'vitest';
import { canSave, focusAfterRemove, formKey, menuAfterRemove, progressLine, scrollDelta } from './recipeFormExtras.js';

const r = (n: string, amt = '') => ({ n, amt });
const key = (key: string, mods: { ctrlKey?: boolean; metaKey?: boolean } = {}) => ({ key, ctrlKey: false, metaKey: false, ...mods });

describe('progressLine', () => {
  it('counts named rows and the finished ones', () => {
    expect(progressLine([r('Rice', '1 cup'), r('Beans'), r('')])).toBe('1 of 2 ingredients done');
    expect(progressLine([r('Rice', '1 cup')])).toBe('1 of 1 ingredient done');
    expect(progressLine([r('A', '1'), r('B', '2')])).toBe('2 of 2 ingredients done');
  });
  it('is empty with no named row', () => {
    expect(progressLine([r('')])).toBe('');
    expect(progressLine([])).toBe('');
  });
  it('counts a linked food with an amount as done', () => {
    expect(progressLine([{ n: 'Pack', amt: '', rid: 'a', q: 1 }])).toBe('1 of 1 ingredient done');
  });
});

describe('formKey', () => {
  it('maps Esc and Ctrl or Cmd+Enter on a desktop', () => {
    expect(formKey(key('Escape'), true)).toBe('back');
    expect(formKey(key('Enter', { ctrlKey: true }), true)).toBe('save');
    expect(formKey(key('Enter', { metaKey: true }), true)).toBe('save');
    expect(formKey(key('Enter'), true)).toBeNull();
    expect(formKey(key('a', { ctrlKey: true }), true)).toBeNull();
  });
  it('does not save while the picker is open or the discard question shows, but Esc still goes back', () => {
    expect(formKey(key('Enter', { ctrlKey: true }), true, true)).toBeNull();
    expect(formKey(key('Escape'), true, true)).toBe('back');
  });
  it('does nothing on a phone', () => {
    expect(formKey(key('Escape'), false)).toBeNull();
    expect(formKey(key('Enter', { ctrlKey: true }), false)).toBeNull();
  });
});

describe('canSave', () => {
  it('blocks a second save and a save after leaving', () => {
    expect(canSave({ saving: false, gone: false })).toBe(true);
    expect(canSave({ saving: true, gone: false })).toBe(false);
    expect(canSave({ saving: false, gone: true })).toBe(false);
  });
});

describe('scrollDelta', () => {
  const view = { top: 0, bottom: 500 };
  it('is zero when the field is clear of the bar', () => expect(scrollDelta({ top: 100, bottom: 140 }, view, 60)).toBe(0));
  it('scrolls down when the bar or keyboard covers the field', () => expect(scrollDelta({ top: 400, bottom: 440 }, view, 60)).toBe(440 - (500 - 60 - 12)));
  it('scrolls up when the field is above the view', () => expect(scrollDelta({ top: -30, bottom: 10 }, view, 60)).toBe(-42));
  it('never pushes the top of a tall field out of view', () => expect(scrollDelta({ top: 20, bottom: 900 }, view, 60)).toBe(8));
});

describe('menuAfterRemove', () => {
  it('closes for the removed row and shifts later ones', () => {
    expect(menuAfterRemove(null, 1)).toBeNull();
    expect(menuAfterRemove(1, 1)).toBeNull();
    expect(menuAfterRemove(3, 1)).toBe(2);
    expect(menuAfterRemove(0, 1)).toBe(0);
  });
});

describe('focusAfterRemove', () => {
  it('goes to the row that took its place, else the previous, else Add ingredient', () => {
    expect(focusAfterRemove(1, 3)).toEqual({ kind: 'row', i: 1 });
    expect(focusAfterRemove(2, 2)).toEqual({ kind: 'row', i: 1 });
    expect(focusAfterRemove(0, 1)).toEqual({ kind: 'row', i: 0 });
    expect(focusAfterRemove(0, 0)).toEqual({ kind: 'add' });
  });
});
