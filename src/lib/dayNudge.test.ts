import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlatSlot, Week } from '../types.js';

const push = vi.hoisted(() => ({ schedulePush: vi.fn(), cancelPush: vi.fn() }));
vi.mock('./pushClient.js', () => push);
import { inQuietHours, NUDGE_DELAY_MS, nudgeAction, trackNudge } from './dayNudge.js';

const slot = (id: string, day: number, extra: Partial<FlatSlot> = {}) => ({ id, day, type: 'single', sec: 'Regular', items: [{ ex: 'sq' }], ...extra }) as unknown as FlatSlot;
const week = (done: string[] = [], skipped: string[] = []) => ({ done: Object.fromEntries(done.map(k => [k, true])), skipped: Object.fromEntries(skipped.map(k => [k, true])), moved: {}, ph: {}, warm: {} }) as unknown as Week;
const day1 = [slot('a', 1), slot('b', 1), slot('c', 1)];
const at = (h: number, m = 0) => new Date(2026, 9, 14, h, m).getTime();

describe('nudgeAction', () => {
  it('a first tick on a day with more to do schedules a nudge saying how many are left', () => {
    expect(nudgeAction(week(), week(['a']), day1)).toEqual({ do: 'schedule', left: 2 });
  });
  it('each further tick schedules again, with the new count', () => {
    expect(nudgeAction(week(['a']), week(['a', 'b']), day1)).toEqual({ do: 'schedule', left: 1 });
  });
  it('the tick that finishes the day cancels it', () => {
    expect(nudgeAction(week(['a', 'b']), week(['a', 'b', 'c']), day1)).toEqual({ do: 'cancel' });
  });
  it('skipping the last open card finishes the day too', () => {
    expect(nudgeAction(week(['a', 'b']), week(['a', 'b'], ['c']), day1)).toEqual({ do: 'cancel' });
  });
  it('a card that is skipped does not count as left', () => {
    expect(nudgeAction(week(), week(['a'], ['b']), day1)).toEqual({ do: 'schedule', left: 1 });
  });
  it('home and optional cards do not keep a day open', () => {
    const slots = [slot('a', 1), slot('h', 1, { sec: 'Home' }), slot('o', 1, { sec: 'Optional' })];
    expect(nudgeAction(week(), week(['a']), slots)).toEqual({ do: 'cancel' }); // the workout is done
  });
  it('a superset counts each exercise: one half ticked is a day started', () => {
    const slots = [slot('s', 1, { type: 'superset', items: [{ ex: 'x' }, { ex: 'y' }] } as Partial<FlatSlot>), slot('b', 1)];
    expect(nudgeAction(week(), week(['s#0']), slots)).toEqual({ do: 'schedule', left: 2 });
  });
  it('unticking a card of a finished day opens it again and schedules from that moment', () => {
    expect(nudgeAction(week(['a', 'b', 'c']), week(['a', 'b']), day1)).toEqual({ do: 'schedule', left: 1 });
  });
  it('unticking the only ticked card leaves nothing started, so nothing to say', () => {
    expect(nudgeAction(week(['a']), week(), day1)).toBeNull();
  });
  it('a change that ticks nothing and finishes nothing is nothing', () => {
    expect(nudgeAction(week(['a']), week(['a'], []), day1)).toBeNull();
  });
  it('follows the day the tick was on when two days are in play', () => {
    const slots = [...day1, slot('d', 2), slot('e', 2)];
    expect(nudgeAction(week(['a', 'b', 'c']), week(['a', 'b', 'c', 'd']), slots)).toEqual({ do: 'schedule', left: 1 });
  });
});

describe('inQuietHours', () => {
  it('is quiet after 9:30 pm and before 6 am, by the device clock', () => {
    expect(inQuietHours(at(21, 30))).toBe(false);
    expect(inQuietHours(at(21, 31))).toBe(true);
    expect(inQuietHours(at(23, 59))).toBe(true);
    expect(inQuietHours(at(0, 10))).toBe(true);
    expect(inQuietHours(at(5, 59))).toBe(true);
    expect(inQuietHours(at(6, 0))).toBe(false);
    expect(inQuietHours(at(12, 0))).toBe(false);
  });
});

describe('trackNudge', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.restoreAllMocks());
  it('schedules 30 minutes after the tick, keyed by the tick time', () => {
    const now = at(18, 30);
    trackNudge(week(), week(['a']), day1, now);
    expect(push.schedulePush).toHaveBeenCalledWith('day-nudge', String(now), now + NUDGE_DELAY_MS, 'Day not finished: 2 exercises left.');
    expect(push.cancelPush).not.toHaveBeenCalled();
  });
  it('says "1 exercise" in the singular', () => {
    trackNudge(week(['a']), week(['a', 'b']), day1, at(18, 0));
    expect(push.schedulePush).toHaveBeenCalledWith('day-nudge', expect.any(String), expect.any(Number), 'Day not finished: 1 exercise left.');
  });
  it('a tick whose nudge would land after 9:30 pm schedules nothing and takes back an earlier one', () => {
    trackNudge(week(), week(['a']), day1, at(21, 10)); // 21:40
    expect(push.schedulePush).not.toHaveBeenCalled();
    expect(push.cancelPush).toHaveBeenCalledWith('day-nudge');
  });
  it('the last tick of the day takes the nudge back', () => {
    trackNudge(week(['a', 'b']), week(['a', 'b', 'c']), day1, at(18, 0));
    expect(push.cancelPush).toHaveBeenCalledWith('day-nudge');
    expect(push.schedulePush).not.toHaveBeenCalled();
  });
  it('does nothing for a change that means nothing', () => {
    trackNudge(week(['a']), week(), day1, at(18, 0));
    expect(push.schedulePush).not.toHaveBeenCalled();
    expect(push.cancelPush).not.toHaveBeenCalled();
  });
});
