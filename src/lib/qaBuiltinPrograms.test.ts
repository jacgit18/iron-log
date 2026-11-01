import { describe, expect, it } from 'vitest';
import { BUILTIN_PROGRAMS } from '../../server/qa/builtinPrograms.js';
import { BUILTIN } from './data.js';

// The QA seed (server/qa/seedPersona.ts) cannot import BUILTIN (server/ may not import src/lib), so it reads a generated copy. Regenerate with
// `npx tsx scripts/qa-builtin-programs.mjs` when this fails.
describe('the QA seed copy of the built-in programs', () => {
  it('equals BUILTIN', () => {
    expect(JSON.parse(JSON.stringify(BUILTIN_PROGRAMS))).toEqual(JSON.parse(JSON.stringify({ A: BUILTIN.A, B: BUILTIN.B })));
  });
});
