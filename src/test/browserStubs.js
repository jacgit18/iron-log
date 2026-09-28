// In-memory stand-ins for the browser pieces the stores touch, so store tests run in Node like a
// fresh browser. Import this before anything from src/store.
import { vi } from 'vitest';

export const mem = {};
vi.stubGlobal('localStorage', {
  getItem: k => (k in mem ? mem[k] : null),
  setItem: (k, v) => { mem[k] = String(v); },
  removeItem: k => { delete mem[k]; },
  key: i => Object.keys(mem)[i] ?? null,
  get length() { return Object.keys(mem).length; },
});
vi.stubGlobal('window', globalThis);
vi.stubGlobal('document', { addEventListener() {}, removeEventListener() {}, visibilityState: 'visible' });

export const clearStorage = () => Object.keys(mem).forEach(k => delete mem[k]);
export const saved = k => JSON.parse(mem['ironlog:' + k] || 'null');
