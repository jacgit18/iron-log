// A minimal zip writer for "Download all" on the Receipts page: files stored without compression (a JPEG does not shrink), no zip64, names as UTF-8.
// Built here instead of adding a package (dependency-selection rung 3): about 60 lines, and a node test reads the result back (zipStore.test.ts).
export interface ZipFile { name: string; data: Uint8Array; date?: Date }

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();

/** The CRC-32 a zip entry carries (the same as zlib's). */
export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const dosTime = (d: Date) => (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
const dosDate = (d: Date) => ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();

/** The bytes of a zip holding `files` in order. Throws past 65,535 files or 4 GB, which this writer does not support. */
export function zipStore(files: readonly ZipFile[]): Uint8Array {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = []; const central: Uint8Array[] = [];
  let offset = 0;
  if (files.length > 0xffff) throw new Error('too many files for a zip');
  for (const f of files) {
    const name = enc.encode(f.name); const when = f.date ?? new Date(); const crc = crc32(f.data); const size = f.data.length;
    if (offset + size > 0xfffffff0) throw new Error('zip too large');
    const head = new DataView(new ArrayBuffer(30));
    head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true);
    head.setUint16(10, dosTime(when), true); head.setUint16(12, dosDate(when), true);
    head.setUint32(14, crc, true); head.setUint32(18, size, true); head.setUint32(22, size, true); head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true);
    cd.setUint16(12, dosTime(when), true); cd.setUint16(14, dosDate(when), true);
    cd.setUint32(16, crc, true); cd.setUint32(20, size, true); cd.setUint32(24, size, true); cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    parts.push(new Uint8Array(head.buffer), name, f.data);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((a, p) => a + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22); let at = 0;
  for (const p of [...parts, ...central, new Uint8Array(end.buffer)]) { out.set(p, at); at += p.length; }
  return out;
}
