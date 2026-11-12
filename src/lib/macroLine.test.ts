import { describe, expect, it } from 'vitest';
import { fmtNum, macroLine, macroWords } from './macroLine.js';

describe('macroLine', () => {
  it('words calories, protein, carbs and fat in the agreed format', () => {
    expect(macroLine({ kcal: 410, p: 22, c: 58, f: 9 })).toBe('410 kcal · P 22 · C 58 · F 9 g');
  });
  it('leaves out the parts a food lacks, and puts the unit after the last gram part', () => {
    expect(macroLine({ kcal: 410 })).toBe('410 kcal');
    expect(macroLine({ kcal: 410, p: 22 })).toBe('410 kcal · P 22 g');
    expect(macroLine({ kcal: 410, p: 22, f: 9 })).toBe('410 kcal · P 22 · F 9 g');
    expect(macroLine({ kcal: 410, c: 58 })).toBe('410 kcal · C 58 g');
    expect(macroLine({ p: 12.5 })).toBe('P 12.5 g');
  });
  it('keeps a real 0 and returns an empty line for a food with no numbers', () => {
    expect(macroLine({ kcal: 90, p: 0 })).toBe('90 kcal · P 0 g');
    expect(macroLine({ kcal: 0 })).toBe('0 kcal');
    expect(macroLine({})).toBe('');
  });
  it('rounds calories to a whole number and grams to one decimal, with thousands separators', () => {
    expect(macroLine({ kcal: 419.6, p: 31.04, c: 47.75, f: 5.5 })).toBe('420 kcal · P 31 · C 47.8 · F 5.5 g');
    expect(macroLine({ kcal: 1520, p: 42 })).toBe('1,520 kcal · P 42 g');
  });
  it('counts a value that is not a finite number as missing', () => {
    expect(macroLine({ kcal: NaN, p: '9' as unknown as number })).toBe('');
    expect(macroLine({ kcal: 300, p: Infinity, c: undefined })).toBe('300 kcal');
  });
});

describe('fmtNum', () => {
  it('groups thousands', () => expect(fmtNum(2775)).toBe('2,775'));
});

describe('macroWords', () => {
  it('words the same numbers in full for a screen reader', () => {
    expect(macroWords({ kcal: 410, p: 22, c: 58, f: 9 })).toBe('410 calories, 22 grams protein, 58 grams carbs, 9 grams fat');
  });
  it('leaves out missing parts, rounds like macroLine and is empty with no numbers', () => {
    expect(macroWords({ kcal: 1520, p: 42 })).toBe('1,520 calories, 42 grams protein');
    expect(macroWords({ kcal: 419.6, p: 31.04, c: 47.75 })).toBe('420 calories, 31 grams protein, 47.8 grams carbs');
    expect(macroWords({ kcal: 90, p: 0 })).toBe('90 calories, 0 grams protein');
    expect(macroWords({ kcal: NaN })).toBe('');
    expect(macroWords({})).toBe('');
  });
});
