import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import '../test/browserStubs.js';

let useTimerStore, useAppStore, mmss;
const t = () => useTimerStore.getState();
const secs = n => vi.advanceTimersByTime(n * 1000);
const setRest = rest => useAppStore.setState(s => ({ cfg: { ...s.cfg, rest } }));

beforeAll(async () => {
  ({ useTimerStore, mmss } = await import('./useTimerStore.js'));
  ({ useAppStore } = await import('./useAppStore.js'));
});
beforeEach(() => { vi.useFakeTimers(); setRest(undefined); });
afterEach(() => { t().stop(); vi.useRealTimers(); });

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
