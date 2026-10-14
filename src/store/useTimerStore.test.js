import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import '../test/browserStubs.js';

vi.mock('../lib/pushClient.js', () => ({ schedulePush: vi.fn(), cancelPush: vi.fn(), pushCovers: vi.fn(() => false) }));
vi.mock('../lib/restNotify.js', () => ({ restNotifyOn: vi.fn(() => false), showRestNotice: vi.fn(), clearRestNotice: vi.fn() }));

let useTimerStore, useAppStore, mmss, restNotifyOn, showRestNotice, schedulePush, cancelPush, pushCovers;
const t = () => useTimerStore.getState();
const secs = n => vi.advanceTimersByTime(n * 1000);
const setRest = rest => useAppStore.setState(s => ({ cfg: { ...s.cfg, rest } }));

beforeAll(async () => {
  ({ useTimerStore, mmss } = await import('./useTimerStore.js'));
  ({ useAppStore } = await import('./useAppStore.js'));
  ({ restNotifyOn, showRestNotice } = await import('../lib/restNotify.js'));
  ({ schedulePush, cancelPush, pushCovers } = await import('../lib/pushClient.js'));
});
beforeEach(() => { vi.useFakeTimers(); setRest(undefined); });
const saved = {};
const put = (k, v) => { if (!(k in saved)) saved[k] = Object.getOwnPropertyDescriptor(globalThis, k); Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true }); };
afterEach(() => {
  t().stop(); vi.useRealTimers(); vi.clearAllMocks(); restNotifyOn.mockReturnValue(false);
  for (const k of Object.keys(saved)) { if (saved[k]) Object.defineProperty(globalThis, k, saved[k]); else delete globalThis[k]; delete saved[k]; }
});

describe('rest timer', () => {
  it('counts down the rest time from Settings (90 s by default) and stops', () => {
    t().startRest();
    expect(t()).toMatchObject({ mode: 'rest', dur: 90, label: 'Rest' });
    secs(89);
    expect(t().mode).toBe('rest');
    expect(Math.ceil(t().remaining())).toBe(1);
    secs(1);
    expect(t().mode).toBeNull();
  });
  it('uses your rest time', () => {
    setRest(60);
    t().startRest();
    expect(t().dur).toBe(60);
  });
});

describe('isometric holds', () => {
  it('runs hold, rest, hold … and says when every hold is done', () => {
    setRest(30);
    t().startHold('Leg Extension', 3, 20);
    expect(t()).toMatchObject({ mode: 'hold', set: 1, sets: 3, dur: 20, label: 'Hold · Leg Extension' });
    secs(20);
    expect(t()).toMatchObject({ mode: 'holdrest', dur: 30, label: 'Rest · then hold 2/3' });
    secs(30);
    expect(t()).toMatchObject({ mode: 'hold', set: 2, dur: 20 });
    secs(20); secs(30);
    expect(t()).toMatchObject({ mode: 'hold', set: 3 });
    secs(20);
    expect(t().mode).toBeNull();
    expect(useAppStore.getState().saveFlag).toBe('Leg Extension: all 3 holds done');
  });
  it('goes straight to the next hold when the rest time is 0', () => {
    setRest(0);
    t().startHold('Plank', 2, 30);
    secs(30);
    expect(t()).toMatchObject({ mode: 'hold', set: 2 });
    secs(30);
    expect(t().mode).toBeNull();
  });
});

describe('pause and adjust', () => {
  it('pausing freezes the time left, and resuming carries on from there', () => {
    t().startRest();
    secs(10);
    t().togglePause();
    expect(t().paused).toBe(80);
    secs(60);
    expect([t().mode, t().remaining()]).toEqual(['rest', 80]);
    t().togglePause();
    secs(79);
    expect(t().mode).toBe('rest');
    secs(1);
    expect(t().mode).toBeNull();
  });
  it('adds or takes off time, never going below 1 s, and stretches the bar to fit', () => {
    t().startRest();
    t().nudge(15);
    expect(t().remaining()).toBe(105);
    expect(t().dur).toBe(105);
    t().nudge(-1000);
    expect(t().remaining()).toBe(1);
    t().togglePause();
    t().nudge(-5);
    expect(t().paused).toBe(1);
    t().nudge(30);
    expect(t().paused).toBe(31);
  });
});

describe('time display', () => {
  it('shows minutes and seconds, rounding up', () => {
    expect([0, 5.2, 59.01, 90, 600].map(mmss)).toEqual(['0:00', '0:06', '1:00', '1:30', '10:00']);
  });
});

// A hidden page's timers are held back, so the clock jumps ahead without the interval running. These move the clock alone
// (setSystemTime fires nothing) and then let the next interval tick find the timer where the clock says it is.
const jump = n => { vi.setSystemTime(Date.now() + n * 1000); vi.advanceTimersByTime(250); };

describe('after the page was hidden', () => {
  it('lands in the right hold and rest, counting from when each phase ended', () => {
    setRest(10);
    t().startHold('Plank', 2, 30);
    jump(35); // hold 1 ended at 30 s, so 5 s of the rest are gone
    expect(t()).toMatchObject({ mode: 'holdrest', set: 1 });
    expect(Math.round(t().remaining())).toBe(5);
    jump(10); // rest ended at 40 s; hold 2 began then and has run 5 s
    expect(t()).toMatchObject({ mode: 'hold', set: 2 });
    expect(Math.round(t().remaining())).toBe(25);
  });
  it('runs through every phase that ended while away and says the holds are done', () => {
    setRest(10);
    t().startHold('Plank', 2, 30);
    jump(500);
    expect(t().mode).toBeNull();
    expect(useAppStore.getState().saveFlag).toBe('Plank: all 2 holds done');
  });
  it('ends a rest that finished while away, once', () => {
    t().startRest();
    jump(300);
    expect(t().mode).toBeNull();
  });
  it('stays quiet about a phase that ended long ago, and buzzes for one that just ended', () => {
    const vibrate = vi.fn();
    put('navigator', { vibrate });
    t().startRest();
    jump(300);
    expect(vibrate).not.toHaveBeenCalled();
    t().startRest();
    secs(90);
    expect(vibrate).toHaveBeenCalledTimes(1);
  });
});

describe('rest over notification', () => {
  const page = state => put('document', { visibilityState: state });
  it('is shown when a rest ends while the page is hidden and the alert is on', () => {
    restNotifyOn.mockReturnValue(true); page('hidden');
    t().startRest(); secs(90);
    expect(showRestNotice).toHaveBeenCalledWith('Rest over. Time for your next set.');
  });
  it('says which hold is next between holds, and when they are all done', () => {
    restNotifyOn.mockReturnValue(true); page('hidden'); setRest(10);
    t().startHold('Plank', 2, 30);
    secs(30); expect(showRestNotice).toHaveBeenLastCalledWith('Hold 1/2 done.');
    secs(10); expect(showRestNotice).toHaveBeenLastCalledWith('Rest over. Hold 2/2 is next.');
    secs(30); expect(showRestNotice).toHaveBeenLastCalledWith('Plank: all 2 holds done.');
  });
  it('is not shown with the page in front, or with the alert off', () => {
    restNotifyOn.mockReturnValue(true); page('visible');
    t().startRest(); secs(90);
    restNotifyOn.mockReturnValue(false); page('hidden');
    t().startRest(); secs(90);
    expect(showRestNotice).not.toHaveBeenCalled();
  });
  it('is not shown while the timer is paused', () => {
    restNotifyOn.mockReturnValue(true); page('hidden');
    t().startRest(); secs(10); t().togglePause(); secs(500);
    expect(showRestNotice).not.toHaveBeenCalled();
  });
});

// Web Push (ADR 044): the server sends the end of a phase if the phone has locked; the page takes its own ask back when it is in front.
describe('push for a phase end', () => {
  const page = state => put('document', { visibilityState: state });
  it('asks for a push at the end of a rest, keyed by the end time, with the notice text', () => {
    t().startRest();
    expect(schedulePush).toHaveBeenCalledTimes(1);
    expect(schedulePush).toHaveBeenCalledWith('rest', String(t().end), t().end, 'Rest over. Time for your next set.');
  });
  it('asks again for each hold and rest, and says which hold is next', () => {
    setRest(10);
    t().startHold('Plank', 2, 30);
    expect(schedulePush).toHaveBeenLastCalledWith('rest', String(t().end), t().end, 'Hold 1/2 done.');
    secs(30);
    expect(schedulePush).toHaveBeenLastCalledWith('rest', String(t().end), t().end, 'Rest over. Hold 2/2 is next.');
  });
  it('pausing takes the ask back, resuming and adjusting ask again for the new end', () => {
    t().startRest(); secs(10);
    t().togglePause();
    expect(cancelPush).toHaveBeenCalledWith('rest');
    vi.clearAllMocks();
    t().togglePause();
    expect(schedulePush).toHaveBeenCalledWith('rest', String(t().end), t().end, 'Rest over. Time for your next set.');
    vi.clearAllMocks();
    t().nudge(15);
    expect(schedulePush).toHaveBeenCalledWith('rest', String(t().end), t().end, expect.any(String));
  });
  it('stopping takes the ask back', () => {
    t().startRest(); vi.clearAllMocks();
    t().stop();
    expect(cancelPush).toHaveBeenCalledWith('rest');
  });
  it('with the page in front at the end, the ask for that end is taken back before it fires', () => {
    page('visible');
    t().startRest(); const end = t().end;
    secs(90);
    expect(cancelPush).toHaveBeenCalledWith('rest', String(end));
  });
  it('with the page away, the push is left alone, and the local notice is skipped only when the server took the push', () => {
    restNotifyOn.mockReturnValue(true); page('hidden');
    t().startRest(); const end = t().end; secs(90);
    expect(cancelPush).not.toHaveBeenCalledWith('rest', String(end));
    expect(showRestNotice).toHaveBeenCalledTimes(1); // the push was not accepted: the local notice is the fallback
    vi.clearAllMocks(); restNotifyOn.mockReturnValue(true); pushCovers.mockReturnValue(true);
    t().startRest(); secs(90);
    expect(showRestNotice).not.toHaveBeenCalled();
    pushCovers.mockReturnValue(false);
  });
  it('does not ask for a phase that already ended while the page was away', () => {
    t().start('rest', 60, 'Rest', Date.now() - 120_000);
    expect(schedulePush).not.toHaveBeenCalled();
  });
});
