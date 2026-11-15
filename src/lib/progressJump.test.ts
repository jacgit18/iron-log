import { describe, expect, it } from 'vitest';
import { JUMP_TTL_MS, requestProgressJump, takeProgressJump } from './progressJump.js';

describe('the one-shot request to open Progress at a spot', () => {
  it('is read once and then gone', () => {
    requestProgressJump('body');
    expect(takeProgressJump()).toBe('body');
    expect(takeProgressJump()).toBeNull();
  });
  it('lapses after ten seconds, so a screen that never opened cannot scroll a later visit', () => {
    requestProgressJump('body', 1000);
    expect(takeProgressJump(1000 + JUMP_TTL_MS + 1)).toBeNull();
    requestProgressJump('body', 1000);
    expect(takeProgressJump(1000 + JUMP_TTL_MS)).toBe('body');
  });
  it('can be cleared by asking for nothing', () => {
    requestProgressJump('body');
    requestProgressJump(null);
    expect(takeProgressJump()).toBeNull();
  });
});
