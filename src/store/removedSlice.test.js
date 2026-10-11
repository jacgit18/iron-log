import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { clearStorage } from '../test/browserStubs.js';

let useAppStore;
const st = () => useAppStore.getState();

beforeAll(async () => {
  ({ useAppStore } = await import('./useAppStore.js'));
  await st().init();
});
beforeEach(() => { clearStorage(); useAppStore.setState({ removed: null, saveFlag: '' }); });

describe('the shared Removed notice state', () => {
  it('Undo runs the restore once, clears the notice and says Put back', () => {
    let n = 0;
    st().noteRemoved('list', 'Squat', () => { n++; });
    expect(st().removed).toMatchObject({ scope: 'list', text: 'Squat' });
    st().undoRemoved();
    st().undoRemoved();
    expect(n).toBe(1);
    expect(st().removed).toBeNull();
    expect(st().saveFlag).toBe('Put back');
  });
  it('a restore that fails says nothing', () => {
    st().noteRemoved('list', 'Squat', () => false);
    st().undoRemoved();
    expect(st().removed).toBeNull();
    expect(st().saveFlag).toBe('');
  });
  it('a newer removal replaces the older one: only the last can be undone', () => {
    const got = [];
    st().noteRemoved('a', 'one', () => { got.push(1); });
    const first = st().removed.id;
    st().noteRemoved('b', 'two', () => { got.push(2); });
    expect(st().removed.id).not.toBe(first);
    st().undoRemoved();
    expect(got).toEqual([2]);
  });
  it('dismissing with a scope only drops a notice from that list', () => {
    st().noteRemoved('a', 'one', () => {});
    st().dismissRemoved('b');
    expect(st().removed).not.toBeNull();
    st().dismissRemoved('a');
    expect(st().removed).toBeNull();
    st().noteRemoved('a', 'one', () => {});
    st().dismissRemoved();
    expect(st().removed).toBeNull();
  });
});
