import { describe, expect, it } from 'vitest';
import { autoWipeDecision, markIsFresh, parseSwitchMark, SWITCH_MARK_MAX_MS, switchMark } from './qaSwitchWipe.js';

const NOW = 1_800_000_000_000;

describe('the switch stamp', () => {
  it('round-trips a time and refuses anything else', () => {
    expect(parseSwitchMark(switchMark(NOW))).toBe(NOW);
    for (const bad of [null, undefined, '', 'abc', '-5', '1e9', '12.5', ' 5', '9'.repeat(16)]) expect(parseSwitchMark(bad), String(bad)).toBeNull();
  });
  it('counts for under two minutes, never from the future', () => {
    expect(markIsFresh(switchMark(NOW - 1000), NOW)).toBe(true);
    expect(markIsFresh(switchMark(NOW - SWITCH_MARK_MAX_MS + 1), NOW)).toBe(true);
    expect(markIsFresh(switchMark(NOW - SWITCH_MARK_MAX_MS), NOW)).toBe(false);
    expect(markIsFresh(switchMark(NOW + 5000), NOW)).toBe(false);
    expect(markIsFresh(null, NOW)).toBe(false);
  });
});

describe('autoWipeDecision', () => {
  const fresh = switchMark(NOW - 3000);
  it('wipes only with a fresh stamp, QA present and a pause for another account', () => {
    expect(autoWipeDecision({ mark: fresh, now: NOW, qa: true, pausedBecause: 'account' })).toBe('wipe');
  });
  it('waits for /api/me while the stamp is fresh and QA is not known yet', () => {
    expect(autoWipeDecision({ mark: fresh, now: NOW, qa: false, pausedBecause: 'account' })).toBe('wait');
  });
  it('leaves the card alone with a missing or stale stamp, whatever else is true (production and staging never write one)', () => {
    expect(autoWipeDecision({ mark: null, now: NOW, qa: true, pausedBecause: 'account' })).toBe('drop');
    expect(autoWipeDecision({ mark: switchMark(NOW - SWITCH_MARK_MAX_MS - 1), now: NOW, qa: true, pausedBecause: 'account' })).toBe('drop');
    expect(autoWipeDecision({ mark: null, now: NOW, qa: false, pausedBecause: 'account' })).toBe('drop');
  });
  it('leaves the card alone for any other pause reason', () => {
    for (const why of ['auth', 'version', 'offline', null, undefined]) expect(autoWipeDecision({ mark: fresh, now: NOW, qa: true, pausedBecause: why }), String(why)).toBe('drop');
  });
});
