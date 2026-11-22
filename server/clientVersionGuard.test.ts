import { describe, expect, it } from 'vitest';
import { minVersionProblem } from './clientVersion.ts';

// The start-up check on MIN_CLIENT_VERSION (ADR 003): a gate newer than the build the server serves would refuse that very build. Pure; server/index.ts exits when this returns a problem.
describe('minVersionProblem', () => {
  it('is fine with no gate, with a gate at or below this build, and with a build that has no number to compare', () => {
    expect(minVersionProblem(null, '1795334322')).toBeNull();
    expect(minVersionProblem(1795332675, '1795334322')).toBeNull(); // the stage 1 merge time, served by a later build
    expect(minVersionProblem(1795334322, '1795334322')).toBeNull(); // the build itself is allowed
    for (const build of [undefined, '', 'dev', 'abc', ' ']) expect(minVersionProblem(1795332675, build), String(build)).toBeNull(); // a local run or a test: nothing to check
  });
  it('names a gate newer than the build, with both numbers and what to do', () => {
    const p = minVersionProblem(1795356564, '1795334322');
    expect(p).toContain('1795356564');
    expect(p).toContain('1795334322');
    expect(p).toMatch(/refused/);
    expect(p).toMatch(/lower MIN_CLIENT_VERSION/);
  });
  it('one second newer is already a problem', () => {
    expect(minVersionProblem(1795334323, '1795334322')).not.toBeNull();
  });
  it('reads the build from the environment as the app does: a whole number, spaces around it allowed', () => {
    expect(minVersionProblem(5, ' 4 ')).not.toBeNull();
    expect(minVersionProblem(4, ' 4 ')).toBeNull();
  });
  it('a build of version 0 (the Cloud Build default when no version is passed) fails any gate above 0', () => {
    expect(minVersionProblem(1, '0')).not.toBeNull();
    expect(minVersionProblem(0, '0')).toBeNull();
  });
});
