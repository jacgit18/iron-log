import { describe, expect, it } from 'vitest';
import { nextTheme, themeButtonLabel, type Theme } from './appearance.js';

// The colours button beside Help steps match device, light, dark, and says where it is and where the next tap goes.
describe('nextTheme', () => {
  it('goes system, light, dark and wraps to system', () => {
    expect(nextTheme('system')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
  });

  it('three taps from any choice come back to it', () => {
    for (const t of ['system', 'light', 'dark'] as Theme[]) expect(nextTheme(nextTheme(nextTheme(t)))).toBe(t);
  });
});

describe('themeButtonLabel', () => {
  it('names the current choice and the next one, in the same words as the old Settings radios', () => {
    expect(themeButtonLabel('system')).toBe('Colours: match this device. Switch to light');
    expect(themeButtonLabel('light')).toBe('Colours: light. Switch to dark');
    expect(themeButtonLabel('dark')).toBe('Colours: dark. Switch to match this device');
  });
});
