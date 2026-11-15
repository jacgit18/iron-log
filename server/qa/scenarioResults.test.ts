import { describe, expect, it } from 'vitest';
import { appendEntry, deviceState, entryProblem, formatResult, latestById, latestEmulatedById, parseResults, type ResultEntry } from './scenarioResults.ts';

const known = new Set(['S-01', 'S-02', 'S-03']);
const devices = new Set(['S-03']);
const e = (over: Partial<ResultEntry> = {}): ResultEntry => ({ id: 'S-01', outcome: 'pass', date: '2026-11-06', by: 'owner', ...over });

describe('QA scenario results', () => {
  it('reads empty text as no results', () => {
    expect(parseResults('', known, devices)).toEqual([]);
    expect(parseResults('  \n', known, devices)).toEqual([]);
  });

  it('refuses a file that is not JSON, not an array, or holds a bad entry, naming it', () => {
    expect(() => parseResults('{', known, devices)).toThrow(/not valid JSON/);
    expect(() => parseResults('{}', known, devices)).toThrow(/array/);
    expect(() => parseResults(JSON.stringify([e(), e({ id: 'S-99' })]), known, devices)).toThrow(/entry 2 names an unknown scenario "S-99"/);
    expect(() => parseResults(JSON.stringify([e({ outcome: 'ok' as never })]), known, devices)).toThrow(/entry 1 has outcome "ok"/);
    expect(() => parseResults(JSON.stringify([e({ date: '6 Nov' })]), known, devices)).toThrow(/YYYY-MM-DD/);
  });

  it('lets only the owner record a phone scenario, and an agent only as emulated', () => {
    expect(entryProblem(e({ id: 'S-03', by: 'claude' }), known, devices)).toMatch(/emulated/);
    expect(entryProblem(e({ id: 'S-03', by: 'owner' }), known, devices)).toBeNull();
    expect(entryProblem(e({ id: 'S-03', by: 'claude', emulated: true }), known, devices)).toBeNull();
  });

  it('refuses emulated on a scenario that needs no phone, on the owner, and as anything but true', () => {
    expect(entryProblem(e({ id: 'S-01', by: 'claude', emulated: true }), known, devices)).toMatch(/does not need a phone/);
    expect(entryProblem(e({ id: 'S-03', by: 'owner', emulated: true }), known, devices)).toMatch(/only an agent/);
    expect(entryProblem({ ...e({ id: 'S-03', by: 'claude' }), emulated: 'yes' }, known, devices)).toMatch(/emulated/);
    expect(() => parseResults(JSON.stringify([e({ id: 'S-03', by: 'claude' })]), known, devices)).toThrow(/entry 1/);
  });

  it('never lets an emulated entry replace the owner phone result, whatever the dates', () => {
    const owner = e({ id: 'S-03', date: '2026-11-10' });
    const emu = e({ id: 'S-03', by: 'claude', emulated: true, outcome: 'fail', date: '2026-11-14' });
    expect(latestById([owner, emu]).get('S-03')).toBe(owner);
    expect(latestById([emu]).has('S-03')).toBe(false);
    expect(latestEmulatedById([owner, emu]).get('S-03')).toBe(emu);
    expect(latestEmulatedById([owner]).size).toBe(0);
  });

  it('keeps the latest entry per scenario: later date wins, same date takes the later line', () => {
    const got = latestById([e({ date: '2026-11-05', outcome: 'fail' }), e({ date: '2026-11-06' }), e({ date: '2026-11-04', outcome: 'blocked' }), e({ id: 'S-02', note: 'a' }), e({ id: 'S-02', note: 'b' })]);
    expect(got.get('S-01')?.outcome).toBe('pass');
    expect(got.get('S-02')?.note).toBe('b');
  });

  it('formats a Result cell with who and build only when they add something', () => {
    expect(formatResult(e())).toBe('2026-11-06 pass');
    expect(formatResult(e({ by: 'claude', build: 'abc123', note: 'ok on QA' }))).toBe('2026-11-06 pass (claude, abc123): ok on QA');
    expect(formatResult(e({ by: 'claude', emulated: true, build: 'abc123' }))).toBe('2026-11-06 pass (claude, emulated, abc123)');
  });

  it('puts a note on one line', () => {
    expect(formatResult(e({ note: 'line one\n  line two' }))).toBe('2026-11-06 pass: line one line two');
  });

  it('appends an entry to the end and leaves earlier ones as they were', () => {
    const first = appendEntry('', e(), known, devices);
    const second = appendEntry(first, e({ id: 'S-02', outcome: 'fail', note: 'x' }), known, devices);
    expect(parseResults(second, known, devices).map(r => r.id)).toEqual(['S-01', 'S-02']);
    expect(second.endsWith('\n')).toBe(true);
    expect(() => appendEntry('[{"id":"S-99"}]', e(), known, devices)).toThrow(/entry 1/);
  });

  it('reads a phone scenario as not tried, passed, failed, blocked, or noted by hand', () => {
    expect(deviceState(undefined, false)).toBe('not tried');
    expect(deviceState(undefined, true)).toBe('noted by hand');
    expect(deviceState(e({ outcome: 'pass' }), false)).toBe('passed');
    expect(deviceState(e({ outcome: 'fail' }), true)).toBe('failed');
    expect(deviceState(e({ outcome: 'blocked' }), false)).toBe('blocked');
  });

  it('reads an agent-only emulated run as emulated, never passed, and the owner result as the phone state', () => {
    const emu = e({ id: 'S-03', by: 'claude', emulated: true, outcome: 'pass' });
    expect(deviceState(undefined, false, emu)).toBe('emulated pass');
    expect(deviceState(undefined, false, { ...emu, outcome: 'fail' })).toBe('emulated fail');
    expect(deviceState(undefined, false, { ...emu, outcome: 'blocked' })).toBe('emulated blocked');
    expect(deviceState(undefined, true, emu)).toBe('noted by hand'); // the owner's own written Result outranks an agent's emulated run
    expect(deviceState(e({ outcome: 'fail' }), false, emu)).toBe('failed');
  });
});
