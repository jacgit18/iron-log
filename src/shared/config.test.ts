import { describe, it, expect } from 'vitest';
import { normConfig } from './config.js';

describe('normConfig lift goals', () => {
  it('keeps the body weight a scaled goal was set at', () => {
    const g = { w: 300, start: 0, bw: 120, bwd: '2026-09-01' };
    expect(normConfig({ liftGoals: { hack: { any: g } } }).liftGoals).toEqual({ hack: { any: g } });
  });
});
