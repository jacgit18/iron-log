import { describe, expect, it } from 'vitest';
import { navOf, onPop, opsFor } from './backNav';

const board = { tab: 'board', modal: false };
const daily = { tab: 'daily', modal: false };
const dailyOpen = { tab: 'daily', modal: true };

describe('navOf', () => {
  it('reads our state and ignores anything else', () => {
    expect(navOf({ nav: { tab: 'daily', modal: true } })).toEqual(dailyOpen);
    expect(navOf({ nav: { tab: 'daily' } })).toEqual(daily);
    expect(navOf(null)).toBeNull();
    expect(navOf({ settingsScreen: 'maxes' })).toBeNull();
    expect(navOf({ nav: { tab: 3 } })).toBeNull();
  });
});

describe('opsFor', () => {
  it('pushes one entry for a tab change, after cleaning the one it leaves', () => {
    expect(opsFor(board, daily, false)).toEqual([{ kind: 'replace', nav: board }, { kind: 'push', nav: daily }]);
  });
  it('does nothing when nothing changed', () => {
    expect(opsFor(daily, daily, false)).toEqual([]);
    expect(opsFor(dailyOpen, dailyOpen, true)).toEqual([]);
  });
  it('pushes an entry when a sheet opens and takes it back when it closes', () => {
    expect(opsFor(daily, dailyOpen, false)).toEqual([{ kind: 'push', nav: dailyOpen }]);
    expect(opsFor(dailyOpen, daily, true)).toEqual([{ kind: 'back' }]);
  });
  it('turns the sheet entry into the new tab when a sheet closes by choosing a tab', () => {
    expect(opsFor(dailyOpen, board, true)).toEqual([{ kind: 'replace', nav: board }]);
  });
  it('does not take back an entry that is no longer the sheet’s (Back already left it)', () => {
    expect(opsFor(dailyOpen, daily, false)).toEqual([]);
  });
});

describe('onPop', () => {
  it('goes back to the tab of the entry reached', () => {
    expect(onPop({ nav: board }, daily)).toEqual({ tab: 'board' });
  });
  it('closes an open sheet when the entry reached has none', () => {
    expect(onPop({ nav: daily }, dailyOpen)).toEqual({ closeModal: true });
  });
  it('leaves an entry that is not ours alone', () => {
    expect(onPop(null, daily)).toEqual({});
    expect(onPop({ settingsScreen: 'maxes' }, daily)).toEqual({});
  });
  it('does nothing when already there', () => {
    expect(onPop({ nav: daily }, daily)).toEqual({});
  });
});
