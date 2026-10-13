import { describe, expect, it } from 'vitest';
import { ChunkLoadError, isChunkFetchError } from './lazyTab.js';

describe('isChunkFetchError', () => {
  it('recognises a failed dynamic import in Chrome, Firefox and Safari', () => {
    expect(isChunkFetchError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/Daily-abc.js'))).toBe(true);
    expect(isChunkFetchError(new TypeError('error loading dynamically imported module: https://x/assets/Daily-abc.js'))).toBe(true);
    expect(isChunkFetchError(new TypeError('Importing a module script failed.'))).toBe(true);
  });
  it('does not mistake an error thrown while the module runs for a download problem', () => {
    expect(isChunkFetchError(new Error('x is not defined'))).toBe(false);
    expect(isChunkFetchError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isChunkFetchError('Failed to fetch dynamically imported module')).toBe(false);
    expect(isChunkFetchError(undefined)).toBe(false);
  });
  it('keeps the original error as the cause', () => {
    const e = new TypeError('Failed to fetch dynamically imported module');
    expect(new ChunkLoadError('x', { cause: e }).cause).toBe(e);
  });
});
