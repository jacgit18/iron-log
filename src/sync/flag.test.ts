import { describe, expect, it } from 'vitest';
import { apiSyncEnabled } from './flag.js';

describe('apiSyncEnabled', () => {
  it('is off by default', () => {
    expect(apiSyncEnabled(null, undefined)).toBe(false);
    expect(apiSyncEnabled(undefined, '')).toBe(false);
    expect(apiSyncEnabled(null, 'false')).toBe(false);
    expect(apiSyncEnabled(null, '1')).toBe(false);
  });
  it('is on when the build says so', () => {
    expect(apiSyncEnabled(null, 'true')).toBe(true);
  });
  it('is on in one browser when its storage says so', () => {
    expect(apiSyncEnabled(true, undefined)).toBe(true);
    expect(apiSyncEnabled('true', undefined)).toBe(true);
  });
  it('an explicit off in a browser beats a build that has it on', () => {
    expect(apiSyncEnabled(false, 'true')).toBe(false);
    expect(apiSyncEnabled('false', 'true')).toBe(false);
  });
  it('ignores anything else stored', () => {
    expect(apiSyncEnabled('yes', undefined)).toBe(false);
    expect(apiSyncEnabled(1, undefined)).toBe(false);
    expect(apiSyncEnabled({}, 'true')).toBe(true); // junk is not an explicit off
  });
});
