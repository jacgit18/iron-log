import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../test/browserStubs.js';
import { clearStorage } from '../test/browserStubs.js';
import { WATER_DEFAULTS, goalMetNow, planWater, setWaterPrefs, trackWater, validTime, waterPrefs } from './waterReminder.js';
import { LS } from './storage.js';
import type { Supplements } from '../types.js';

const push = vi.hoisted(() => ({ on: true, schedule: vi.fn(async () => true), cancel: vi.fn() }));
vi.mock('./pushClient.js', () => ({
  pushKindOn: () => push.on,
  schedulePush: push.schedule,
  cancelPush: push.cancel,
}));

const H = 3_600_000;
const at = (h: number, m = 0) => new Date(2026, 9, 21, h, m).getTime(); // 2026-10-21, local time
const prefs = { ...WATER_DEFAULTS };
const supp = (oz: number[], goal = 64): Supplements => ({ waterGoal: goal, waterMode: 'fixed', water: oz.length ? { '2026-10-21': oz } : {}, boost: {}, items: [], taken: {} });

beforeEach(() => { clearStorage(); push.on = true; push.schedule.mockClear(); push.cancel.mockClear(); });

describe('planWater', () => {
  it('asks for the next reminder an interval from now', () => {
    expect(planWater(at(10), prefs, false)).toEqual({ at: at(12), until: at(21, 30) });
    expect(planWater(at(10), { ...prefs, everyH: 1 }, false)?.at).toBe(at(11));
    expect(planWater(at(10), { ...prefs, everyH: 3 }, false)?.at).toBe(at(13));
  });
  it('none once the goal is met', () => { expect(planWater(at(10), prefs, true)).toBeNull(); });
  it('waits for the window to open when it is earlier, if that is within what the server takes', () => {
    expect(planWater(at(6), prefs, false)?.at).toBe(at(8));
    expect(planWater(at(4), prefs, false)).toBeNull(); // 4 hours ahead: past the 3 hour limit
  });
  it('none when the next one would land after the window ends', () => {
    expect(planWater(at(20), prefs, false)).toBeNull();
    expect(planWater(at(19, 30), prefs, false)?.at).toBe(at(21, 30)); // exactly the end is still inside
    expect(planWater(at(19, 31), prefs, false)).toBeNull();
    expect(planWater(at(22), prefs, false)).toBeNull();
  });
  it('none for a window that ends before it starts', () => { expect(planWater(at(10), { ...prefs, from: '12:00', until: '09:00' }, false)).toBeNull(); });
});

describe('goalMetNow', () => {
  it('is true only when something was logged and it reaches the goal', () => {
    expect(goalMetNow(supp([]), [], at(10))).toBe(false);
    expect(goalMetNow(supp([16, 16]), [], at(10))).toBe(false);
    expect(goalMetNow(supp([32, 32]), [], at(10))).toBe(true);
    expect(goalMetNow(supp([16], 8), [], at(10))).toBe(true);
  });
});

describe('prefs', () => {
  it('defaults, and ignores a stored value that is not valid', () => {
    expect(waterPrefs()).toEqual(prefs);
    LS.set('waterEvery', 5); LS.set('waterFrom', '8am'); LS.set('waterUntil', '24:00');
    expect(waterPrefs()).toEqual(prefs);
    LS.set('waterEvery', 3); LS.set('waterFrom', '07:15'); LS.set('waterUntil', '20:00');
    expect(waterPrefs()).toEqual({ everyH: 3, from: '07:15', until: '20:00' });
  });
  it('validTime', () => { expect(['00:00', '23:59', '08:05'].every(validTime)).toBe(true); expect(['24:00', '8:00', '12:60', '', null].some(validTime)).toBe(false); });
});

describe('trackWater', () => {
  it('does nothing while the kind is off', () => {
    push.on = false;
    trackWater('drink', false, at(10));
    expect(push.schedule).not.toHaveBeenCalled();
    expect(push.cancel).not.toHaveBeenCalled();
  });
  it('a drink arms the next reminder from now and carries the repeat', () => {
    trackWater('drink', false, at(10));
    expect(push.schedule).toHaveBeenCalledWith('water', `w${at(12)}`, at(12), 'Time for a glass of water.', { everyMs: 2 * H, until: at(21, 30) });
  });
  it('a drink that reaches the goal cancels instead', () => {
    trackWater('drink', false, at(10));
    trackWater('drink', true, at(11));
    expect(push.cancel).toHaveBeenCalledWith('water');
    expect(push.schedule).toHaveBeenCalledTimes(1);
  });
  it('a drink late in the day, with no room for another, cancels what was armed', () => {
    trackWater('drink', false, at(19));
    trackWater('drink', false, at(20));
    expect(push.cancel).toHaveBeenCalledWith('water');
    expect(push.schedule).toHaveBeenCalledTimes(1);
  });
  it('asks for no cancel when nothing is armed (the goal is met, or the window has closed, each time the app opens)', () => {
    trackWater('open', true, at(18));
    trackWater('open', false, at(22));
    trackWater('open', false, at(22, 5));
    expect(push.cancel).not.toHaveBeenCalled();
    expect(push.schedule).not.toHaveBeenCalled();
  });
  it('a refused re-arm puts back the chain that was armed before, so a later cancel still reaches it', async () => {
    trackWater('open', false, at(9));
    const before = LS.get('waterArmed');
    push.schedule.mockResolvedValueOnce(false);
    trackWater('drink', false, at(10));
    await Promise.resolve(); await Promise.resolve();
    expect(LS.get('waterArmed')).toEqual(before);
    trackWater('drink', true, at(10, 30));
    expect(push.cancel).toHaveBeenCalledWith('water');
  });
  it('opening the app arms when nothing is armed, and leaves an armed chain alone', () => {
    trackWater('open', false, at(9));
    expect(push.schedule).toHaveBeenCalledTimes(1);
    trackWater('open', false, at(10));
    trackWater('change', false, at(11));
    expect(push.schedule).toHaveBeenCalledTimes(1); // opening again did not push the coming reminder away
  });
  it('plans afresh once the armed window has ended', () => {
    trackWater('open', false, at(9));
    trackWater('open', false, at(21, 31));
    expect(push.schedule).toHaveBeenCalledTimes(1); // after the window there is nothing to plan today
    trackWater('open', false, at(9) + 24 * H);
    expect(push.schedule).toHaveBeenCalledTimes(2);
  });
  it('forgets the note when the server did not take the ask, so the next open tries again', async () => {
    push.schedule.mockResolvedValueOnce(false);
    trackWater('open', false, at(9));
    await Promise.resolve(); await Promise.resolve();
    expect(LS.get('waterArmed')).toBeNull();
    trackWater('open', false, at(9, 5));
    expect(push.schedule).toHaveBeenCalledTimes(2);
  });
  it('changing a setting drops the old chain and plans with the new one', () => {
    trackWater('open', false, at(9));
    setWaterPrefs({ everyH: 1 }, false, at(9, 30));
    expect(push.schedule).toHaveBeenLastCalledWith('water', `w${at(10, 30)}`, at(10, 30), 'Time for a glass of water.', { everyMs: H, until: at(21, 30) });
  });
});
