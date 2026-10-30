import { describe, expect, it } from 'vitest';
import { trainsMuscle } from './muscleFilter.js';
import type { Cfg } from '../types.ts';

const cfg = { muscleMap: { bp: { p: ['chest'], s: ['triceps'] }, mob: { mob: true }, none: {} } } as unknown as Cfg;

describe('trainsMuscle', () => {
  it('matches everything when no muscle is chosen', () => expect(trainsMuscle(cfg, 'bp', null, false)).toBe(true));
  it('matches a primary muscle', () => expect(trainsMuscle(cfg, 'bp', 'chest', false)).toBe(true));
  it('matches a secondary muscle only when secondary work counts', () => {
    expect(trainsMuscle(cfg, 'bp', 'triceps', false)).toBe(false);
    expect(trainsMuscle(cfg, 'bp', 'triceps', true)).toBe(true);
  });
  it('never matches a mobility-only or untagged exercise', () => {
    expect(trainsMuscle(cfg, 'mob', 'chest', true)).toBe(false);
    expect(trainsMuscle(cfg, 'none', 'chest', true)).toBe(false);
    expect(trainsMuscle(cfg, 'unknown-id', 'chest', true)).toBe(false);
  });
});
