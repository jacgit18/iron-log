import { describe, expect, it } from 'vitest';
import { featureOn } from './features.js';

describe('featureOn', () => {
  it('admin-only features show for an admin and nobody else', () => {
    expect(featureOn('admin', true)).toBe(true);
    expect(featureOn('admin', false)).toBe(false);
  });
  it('off is off even for an admin', () => {
    expect(featureOn('off', true)).toBe(false);
  });
  it('all is on for everyone', () => {
    expect(featureOn('all', false)).toBe(true);
  });
  it('a feature not in the registry is hidden, even from an admin', () => {
    expect(featureOn(undefined, false)).toBe(false);
    expect(featureOn(undefined, true)).toBe(false);
  });
});
