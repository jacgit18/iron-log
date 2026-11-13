import { describe, expect, it } from 'vitest';
import { requestProgressJump, takeProgressJump } from './progressJump.js';

describe('the one-shot request to open Progress at a spot', () => {
  it('is read once and then gone', () => {
    requestProgressJump('body');
    expect(takeProgressJump()).toBe('body');
    expect(takeProgressJump()).toBeNull();
  });
});
