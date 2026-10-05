// Unit cases for the manual move heads-up (moveClashes) and its "Move to Day N instead" (altDay).
// The property tests for suggested card moves are in planOrder.test.js; the store round trip in useAppStore.test.js.
import { describe, it, expect } from 'vitest';
import { DEFAULT_CFG, DAYS, moveClashes, altDay } from './logic.js';

describe('moveCard', () => {
  describe('moveClashes', () => {
    it('detects when the same exercise is already on the target day', () => {
      const cfg = DEFAULT_CFG;
      const slots = [
        { id: 's1', day: 1, type: 'single', items: [{ ex: 'sq' }] },
        { id: 's2', day: 2, type: 'single', items: [{ ex: 'sq' }] },
      ];
      const week = { done: {}, skipped: {}, moved: {}, ph: {}, warm: {} };
      const clashes = moveClashes(cfg, week, slots, slots[0], 2);
      expect(clashes.length).toBeGreaterThan(0);
      expect(clashes[0].toLowerCase()).toContain('sq');
    });

    it('detects clash on back-to-back days', () => {
      const cfg = DEFAULT_CFG;
      const slots = [
        { id: 's1', day: 1, type: 'single', items: [{ ex: 'sq' }] },
        { id: 's2', day: 3, type: 'single', items: [{ ex: 'sq' }] },
      ];
      const week = { done: {}, skipped: {}, moved: {}, ph: {}, warm: {} };
      // Moving s1 to day 2 should clash with s2 on day 3 (back-to-back).
      const clashes = moveClashes(cfg, week, slots, slots[0], 2);
      expect(clashes.length).toBeGreaterThan(0);
    });

    it('ignores skipped cards', () => {
      const cfg = DEFAULT_CFG;
      const slots = [
        { id: 's1', day: 1, type: 'single', items: [{ ex: 'sq' }] },
        { id: 's2', day: 2, type: 'single', items: [{ ex: 'sq' }] },
      ];
      const week = { done: {}, skipped: { 's2': true }, moved: {}, ph: {}, warm: {} };
      const clashes = moveClashes(cfg, week, slots, slots[0], 2);
      expect(clashes.length).toBe(0);
    });

    it('returns empty array when no clash', () => {
      const cfg = DEFAULT_CFG;
      const slots = [
        { id: 's1', day: 1, type: 'single', items: [{ ex: 'sq' }] },
        { id: 's2', day: 2, type: 'single', items: [{ ex: 'bench' }] },
      ];
      const week = { done: {}, skipped: {}, moved: {}, ph: {}, warm: {} };
      const clashes = moveClashes(cfg, week, slots, slots[0], 2);
      expect(clashes).toHaveLength(0);
    });
  });

  describe('altDay', () => {
    it('finds a clash-free day', () => {
      const cfg = DEFAULT_CFG;
      const slots = [
        { id: 's1', day: 1, type: 'single', items: [{ ex: 'sq' }] },
        { id: 's2', day: 2, type: 'single', items: [{ ex: 'sq' }] },
        { id: 's3', day: 4, type: 'single', items: [{ ex: 'bench' }] },
      ];
      const week = { done: {}, skipped: {}, moved: {}, ph: {}, warm: {} };
      const alt = altDay(cfg, week, slots, slots[0], 2, 1);
      // Should find day 3 or 4 (no clash).
      expect([3, 4]).toContain(alt);
    });

    it('returns null when no alternative exists', () => {
      const cfg = DEFAULT_CFG;
      const slots = DAYS.map(d => ({ id: `s${d}`, day: d, type: 'single', items: [{ ex: 'sq' }] }));
      const week = { done: {}, skipped: {}, moved: {}, ph: {}, warm: {} };
      expect(altDay(cfg, week, slots, slots[0], 2, 1)).toBeNull();
    });
  });
});
