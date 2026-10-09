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
  it('all, and a feature not in the registry, are on for everyone', () => {
    expect(featureOn('all', false)).toBe(true);
    expect(featureOn(undefined, false)).toBe(true);
  });
});
