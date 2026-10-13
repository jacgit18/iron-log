import { describe, it, expect } from 'vitest';
import { mimeFor, XLSX_MIME, JSON_MIME } from './mime.js';
import { IMPORT_ACCEPT, JSON_ACCEPT, importFileProblem, readFailure, MAX_IMPORT_BYTES } from './importFile.js';

describe('mimeFor', () => {
  it('names the right media type for each export', () => {
    expect(mimeFor('a.xlsx')).toBe(XLSX_MIME);
    expect(mimeFor('iron-log-data-2026-09-24.json')).toBe(JSON_MIME);
    expect(mimeFor('a.csv')).toBe('text/csv');
    expect(mimeFor('a.bin')).toBe('application/octet-stream');
  });
});

describe('import picker', () => {
  it('accepts every import type by extension and by media type', () => {
    ['.json', 'application/json', '.csv', 'text/csv', '.xlsx', XLSX_MIME].forEach(t => expect(IMPORT_ACCEPT.split(',')).toContain(t));
    expect(JSON_ACCEPT.split(',')).toEqual(['.json', 'application/json']);
  });
  it('refuses a huge or empty file before reading it', () => {
    expect(importFileProblem({ name: 'a.json', size: 1000 })).toBe('');
    expect(importFileProblem({ name: 'a.json', size: MAX_IMPORT_BYTES + 1 })).toMatch(/too big/);
    expect(importFileProblem({ name: 'a.json', size: 0 })).toMatch(/empty/);
  });
  it('words a failed read plainly', () => {
    expect(readFailure(new Error('The requested file could not be read, typically due to permission problems'))).toMatch(/download it to the phone/);
    expect(readFailure(new Error('Excel library failed to load'))).toBe('Excel library failed to load');
    expect(readFailure('x')).toBe('Couldn’t read that file');
  });
});
