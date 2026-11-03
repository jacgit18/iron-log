import { describe, expect, it } from 'vitest';
import { dailyCap } from './otpEmail.ts';
import { createTryGate } from './tryGate.ts';

const opts = { perNetwork: 3, perAddress: 5, windowMs: 1000 };

describe('createTryGate', () => {
  it('runs tries for one address one after another', async () => {
    const gate = createTryGate(opts);
    const order: string[] = [];
    const run = async (name: string) => {
      if (!(await gate.begin('a@x.com', 'n1'))) return;
      order.push(`${name}:start`);
      await new Promise(r => setTimeout(r, 5));
      order.push(`${name}:end`);
      gate.end('a@x.com', false);
    };
    await Promise.all([run('1'), run('2'), run('3')]);
    expect(order).toEqual(['1:start', '1:end', '2:start', '2:end', '3:start', '3:end']);
  });

  it('counts only wrong codes: right codes never lock anyone out', async () => {
    const gate = createTryGate(opts);
    for (let i = 0; i < 20; i++) {
      expect(await gate.begin('a@x.com', 'n1')).toBe(true);
      gate.end('a@x.com', false);
    }
  });

  it('stops an address from a network after its wrong codes, but not the same address from another network', async () => {
    const gate = createTryGate(opts);
    for (let i = 0; i < 3; i++) { expect(await gate.begin('a@x.com', 'n1')).toBe(true); gate.end('a@x.com', true); }
    expect(await gate.begin('a@x.com', 'n1')).toBe(false);
    expect(await gate.begin('a@x.com', 'n2')).toBe(true);
    gate.end('a@x.com', false);
    expect(await gate.begin('b@x.com', 'n1')).toBe(true);
  });

  it('stops everyone at the per-address backstop', async () => {
    const gate = createTryGate(opts);
    for (let i = 0; i < 5; i++) { expect(await gate.begin('a@x.com', `n${i}`)).toBe(true); gate.end('a@x.com', true); }
    expect(await gate.begin('a@x.com', 'fresh')).toBe(false);
  });

  it('frees up when the window passes', async () => {
    let t = 0;
    const gate = createTryGate({ ...opts, now: () => t });
    for (let i = 0; i < 3; i++) { await gate.begin('a@x.com', 'n1'); gate.end('a@x.com', true); }
    expect(await gate.begin('a@x.com', 'n1')).toBe(false);
    t = 1001;
    expect(await gate.begin('a@x.com', 'n1')).toBe(true);
  });

  it('frees a turn that never reports back, and refuses a pile-up', async () => {
    const gate = createTryGate({ ...opts, holdMs: 20, maxWaiting: 2 });
    expect(await gate.begin('a@x.com', 'n1')).toBe(true);
    const second = gate.begin('a@x.com', 'n1');
    const third = gate.begin('a@x.com', 'n1');
    expect(await gate.begin('a@x.com', 'n1')).toBe(false);
    expect(await second).toBe(true);
    gate.end('a@x.com', false);
    expect(await third).toBe(true);
    gate.end('a@x.com', false);
  });
});

describe('dailyCap', () => {
  it('allows max in 24 hours, then again as the day rolls over; zero is no cap', () => {
    let t = 0;
    const allow = dailyCap(2, () => t);
    expect([allow(), allow(), allow()]).toEqual([true, true, false]);
    t = 24 * 60 * 60_000 + 1;
    expect(allow()).toBe(true);
    const off = dailyCap(0);
    expect(Array.from({ length: 500 }, off).every(Boolean)).toBe(true);
  });
});
