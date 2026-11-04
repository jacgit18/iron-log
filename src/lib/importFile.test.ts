import { describe, expect, it } from 'vitest';
import { readFailure } from './importFile.js';

// Brief polish-theme-flash-pressed-errors: a file that cannot be read says so in a plain sentence, never a raw error string.
describe('readFailure', () => {
  it('explains a cloud file that has not downloaded', () => {
    const e = Object.assign(new Error('The requested file could not be read'), { name: 'NotReadableError' });
    expect(readFailure(e)).toMatch(/download it to the phone first/);
  });

  it('keeps a plain sentence the app threw itself', () => {
    expect(readFailure(new Error('Excel library failed to load'))).toBe('Excel library failed to load');
  });

  it('never returns the raw message of an unknown error', () => {
    for (const e of [new Error('Error: 500 undefined'), new TypeError('x is not a function'), 'boom', undefined, { message: 'raw' }]) {
      const out = readFailure(e);
      expect(out).toBe('Couldn’t read that file');
      expect(out).not.toMatch(/500|undefined|not a function|boom|raw/);
    }
  });
});
