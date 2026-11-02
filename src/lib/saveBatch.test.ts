import { describe, expect, it } from 'vitest';
import { makeBatchWriter } from './saveBatch.js';

const spy = () => {
  const calls: string[] = [];
  return { calls, save: (p: string, d: unknown) => calls.push(`save ${p} ${JSON.stringify(d)}`), removeDoc: (p: string) => calls.push(`remove ${p}`) };
};

describe('makeBatchWriter', () => {
  it('forwards straight away outside a batch', () => {
    const w = spy(); const b = makeBatchWriter(w);
    b.save('a', 1); b.removeDoc('b');
    expect(w.calls).toEqual(['save a 1', 'remove b']);
  });
  it('holds writes until commit, in first-written order with the latest data', () => {
    const w = spy(); const b = makeBatchWriter(w);
    expect(b.begin()).toBe(true);
    b.save('a', 1); b.save('b', 2); b.save('a', 3); b.removeDoc('c');
    expect(w.calls).toEqual([]);
    expect(b.isHeld('a')).toBe(true);
    b.commit();
    expect(w.calls).toEqual(['save a 3', 'save b 2', 'remove c']);
    expect(b.isHeld('a')).toBe(false);
  });
  it('drops everything on discard', () => {
    const w = spy(); const b = makeBatchWriter(w);
    b.begin(); b.save('a', 1); b.discard(); b.commit();
    expect(w.calls).toEqual([]);
    b.save('z', 9); expect(w.calls).toEqual(['save z 9']);
  });
  it('a second begin joins the open batch', () => {
    const b = makeBatchWriter(spy());
    expect(b.begin()).toBe(true); expect(b.begin()).toBe(false);
  });
  it('copies the data when held, so a later change to it is not written', () => {
    const w = spy(); const b = makeBatchWriter(w); const d = { n: 1 };
    b.begin(); b.save('a', d); d.n = 2; b.commit();
    expect(w.calls).toEqual(['save a {"n":1}']);
  });
});
