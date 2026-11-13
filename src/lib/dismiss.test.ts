import { describe, expect, it } from 'vitest';
import { dismissFor } from './dismiss';

describe('dismissFor', () => {
  it('closes on a press outside the box', () => expect(dismissFor({ type: 'pointerdown', inside: false })).toBe('outside'));
  it('ignores a press inside the box', () => expect(dismissFor({ type: 'pointerdown', inside: true })).toBeNull());
  it('closes on Escape and asks for focus to return', () => expect(dismissFor({ type: 'keydown', key: 'Escape' })).toBe('escape'));
  it('ignores other keys', () => {
    for (const key of ['Enter', 'Tab', ' ', 'ArrowDown', 'escape']) expect(dismissFor({ type: 'keydown', key })).toBeNull();
  });
});
