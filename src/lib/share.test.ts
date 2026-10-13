import { describe, it, expect, vi } from 'vitest';
import { canShareFiles, shareFile, exportFile, mimeFor, XLSX_MIME, JSON_MIME } from './share.js';
import { IMPORT_ACCEPT, JSON_ACCEPT, importFileProblem, readFailure, MAX_IMPORT_BYTES } from './importFile.js';

const err = (name: string) => Object.assign(new Error(name), { name });
const file = () => exportFile('iron-log-2026-09-24.xlsx', new Uint8Array([80, 75, 3, 4]));

describe('mimeFor / exportFile', () => {
  it('names the right media type and keeps the file name and bytes', async () => {
    expect(mimeFor('a.xlsx')).toBe(XLSX_MIME);
    expect(mimeFor('iron-log-data-2026-09-24.json')).toBe(JSON_MIME);
    expect(mimeFor('a.csv')).toBe('text/csv');
    const f = file();
    expect(f.name).toBe('iron-log-2026-09-24.xlsx');
    expect(f.type).toBe(XLSX_MIME);
    expect(new Uint8Array(await f.arrayBuffer())).toEqual(new Uint8Array([80, 75, 3, 4]));
  });
});

describe('canShareFiles', () => {
  it('is false without share or canShare', () => {
    expect(canShareFiles(undefined)).toBe(false);
    expect(canShareFiles({})).toBe(false);
    expect(canShareFiles({ share: vi.fn() } as never)).toBe(false);
    expect(canShareFiles({ canShare: () => true } as never)).toBe(false);
  });
  it('is false when canShare refuses files, or throws', () => {
    expect(canShareFiles({ share: vi.fn(), canShare: () => false } as never)).toBe(false);
    expect(canShareFiles({ share: vi.fn(), canShare: () => { throw new Error('x'); } } as never)).toBe(false);
  });
  it('is true when canShare accepts both export file types', () => {
    const canShare = vi.fn((d: ShareData) => d.files!.length === 1);
    expect(canShareFiles({ share: vi.fn(), canShare } as never)).toBe(true);
    expect(canShare.mock.calls.map(c => c[0].files![0].type)).toEqual([XLSX_MIME, JSON_MIME]);
  });
  it('is false if only one of the types can be shared', () => {
    expect(canShareFiles({ share: vi.fn(), canShare: (d: ShareData) => d.files![0].type === XLSX_MIME } as never)).toBe(false);
  });
});

describe('shareFile', () => {
  it('shares the file it was given and reports shared', async () => {
    const share = vi.fn().mockResolvedValue(undefined); const f = file();
    expect(await shareFile(f, { share, canShare: () => true } as never)).toBe('shared');
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0].files).toEqual([f]);
  });
  it('calls share synchronously (before any await), so the tap permission is still live', () => {
    const share = vi.fn().mockResolvedValue(undefined);
    void shareFile(file(), { share, canShare: () => true } as never);
    expect(share).toHaveBeenCalledTimes(1);
  });
  it('treats AbortError (the person closed the sheet) as cancelled, not a failure', async () => {
    expect(await shareFile(file(), { share: () => Promise.reject(err('AbortError')), canShare: () => true } as never)).toBe('cancelled');
  });
  it('reports NotAllowedError as blocked so the caller can offer a second tap', async () => {
    expect(await shareFile(file(), { share: () => Promise.reject(err('NotAllowedError')), canShare: () => true } as never)).toBe('blocked');
    expect(await shareFile(file(), { share: () => { throw err('NotAllowedError'); }, canShare: () => true } as never)).toBe('blocked');
  });
  it('reports any other error, or an unsupported file, as failed (the caller falls back to the download)', async () => {
    expect(await shareFile(file(), { share: () => Promise.reject(err('DataError')), canShare: () => true } as never)).toBe('failed');
    expect(await shareFile(file(), { share: () => { throw new TypeError('x'); }, canShare: () => true } as never)).toBe('failed');
    const share = vi.fn();
    expect(await shareFile(file(), { share, canShare: () => false } as never)).toBe('failed');
    expect(share).not.toHaveBeenCalled();
    expect(await shareFile(file(), {})).toBe('failed');
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
