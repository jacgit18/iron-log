import { describe, expect, it } from 'vitest';
import { crc32, zipStore } from './zipStore.js';

const text = (s: string) => new TextEncoder().encode(s);
const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);

describe('crc32', () => {
  it('matches the standard check value', () => expect(crc32(text('123456789'))).toBe(0xcbf43926));
  it('is 0 for nothing', () => expect(crc32(new Uint8Array())).toBe(0));
});

describe('zipStore', () => {
  const zip = zipStore([{ name: 'a.txt', data: text('hello'), date: new Date(2026, 10, 10, 12, 30, 40) }, { name: 'é/b.jpg', data: new Uint8Array([1, 2, 3]) }]);
  const v = view(zip);
  const end = zip.length - 22;
  it('ends with a directory record that counts both files', () => {
    expect(v.getUint32(end, true)).toBe(0x06054b50);
    expect(v.getUint16(end + 10, true)).toBe(2);
    expect(v.getUint32(end + 12, true) + v.getUint32(end + 16, true)).toBe(end);
  });
  it('stores each file as is, with its crc and a UTF-8 name', () => {
    expect(v.getUint32(0, true)).toBe(0x04034b50);
    expect(v.getUint16(8, true)).toBe(0); // stored
    expect(v.getUint32(14, true)).toBe(crc32(text('hello')));
    expect(new TextDecoder().decode(zip.subarray(30, 35))).toBe('a.txt');
    expect(new TextDecoder().decode(zip.subarray(35, 40))).toBe('hello');
    const second = 40;
    const nlen = v.getUint16(second + 26, true);
    expect(new TextDecoder().decode(zip.subarray(second + 30, second + 30 + nlen))).toBe('é/b.jpg');
  });
  it('points each directory entry at its local header', () => {
    const cd = v.getUint32(end + 16, true);
    expect(v.getUint32(cd + 42, true)).toBe(0);
    const next = cd + 46 + 5;
    expect(v.getUint32(next + 42, true)).toBe(40);
  });
  it('writes the date and time in zip format', () => {
    expect(v.getUint16(10, true)).toBe((12 << 11) | (30 << 5) | 20);
    expect(v.getUint16(12, true)).toBe(((2026 - 1980) << 9) | (11 << 5) | 10);
  });
  it('is just an end record for no files', () => expect(zipStore([]).length).toBe(22));
});
