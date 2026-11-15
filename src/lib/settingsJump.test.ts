import { describe, expect, it } from 'vitest';
import { requestSettingsJump, takeSettingsJump } from './settingsJump.js';

describe('the one-shot request to open Settings at a spot', () => {
  it('is read once and then gone', () => {
    requestSettingsJump('alerts');
    expect(takeSettingsJump()).toBe('alerts');
    expect(takeSettingsJump()).toBeNull();
  });
});
