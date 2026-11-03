import { describe, expect, it } from 'vitest';
import { dailyCap } from './otpEmail.ts';
import { createTryGate } from './tryGate.ts';

const opts = { perNetwork: 3, perAddress: 5, windowMs: 1000 };

describe('createTryGate', () => {
  /** A try that ends with `wrong`; returns false when it was refused. */
  const attempt = async (gate: ReturnType<typeof createTryGate>, email: string, network: string, wrong: boolean) => {
    const turn = await gate.begin(email, network);
    turn?.end(wrong);
    return turn !== null;
  };

  it('runs tries for one address one after another', async () => {
    const gate = createTryGate(opts);
    const order: string[] = [];
    const run = async (name: string) => {
      const turn = await gate.begin('a@x.com', 'n1');
      order.push(`${name}:start`);
      await new Promise(r => setTimeout(r, 5));
      order.push(`${name}:end`);
      turn?.end(false);
    };
    await Promise.all([run('1'), run('2'), run('3')]);
    expect(order).toEqual(['1:start', '1:end', '2:start', '2:end', '3:start', '3:end']);
  });

  it('counts only wrong codes: right codes never lock anyone out', async () => {
    const gate = createTryGate(opts);
    for (let i = 0; i < 20; i++) expect(await attempt(gate, 'a@x.com', 'n1', false)).toBe(true);
  });

  it('stops an address from a network after its wrong codes, but not the same address from another network', async () => {
    const gate = createTryGate(opts);
    for (let i = 0; i < 3; i++) expect(await attempt(gate, 'a@x.com', 'n1', true)).toBe(true);
    expect(await attempt(gate, 'a@x.com', 'n1', false)).toBe(false);
    expect(await attempt(gate, 'a@x.com', 'n2', false)).toBe(true);
    expect(await attempt(gate, 'b@x.com', 'n1', false)).toBe(true);
  });

  it('stops everyone at the per-address backstop', async () => {
    const gate = createTryGate(opts);
    for (let i = 0; i < 5; i++) expect(await attempt(gate, 'a@x.com', `n${i}`, true)).toBe(true);
    expect(await attempt(gate, 'a@x.com', 'fresh', false)).toBe(false);
  });

  it('frees up when the window passes', async () => {
    let t = 0;
    const gate = createTryGate({ ...opts, now: () => t });
    for (let i = 0; i < 3; i++) await attempt(gate, 'a@x.com', 'n1', true);
    expect(await attempt(gate, 'a@x.com', 'n1', false)).toBe(false);
    t = 1001;
    expect(await attempt(gate, 'a@x.com', 'n1', false)).toBe(true);
  });

  it('frees a turn that never reports back, and refuses a pile-up', async () => {
    const gate = createTryGate({ ...opts, holdMs: 20, maxWaiting: 2 });
    const first = await gate.begin('a@x.com', 'n1');
    const second = gate.begin('a@x.com', 'n1');
    const third = gate.begin('a@x.com', 'n1');
    expect(await gate.begin('a@x.com', 'n1')).toBeNull();
    const secondTurn = await second;
    expect(secondTurn).not.toBeNull();
    secondTurn!.end(false);
    (await third)!.end(false);
    first!.end(false);
  });

  it('a late report from a turn that timed out cannot end the next turn, and its wrong code is charged to its own network', async () => {
    const gate = createTryGate({ ...opts, holdMs: 20 });
    const a = await gate.begin('a@x.com', 'attacker');
    const b = await gate.begin('a@x.com', 'victim'); // waits until a's hold runs out
    let cStarted = false;
    const c = gate.begin('a@x.com', 'victim').then(turn => { cStarted = true; return turn; });
    a!.end(true); // late: must not end b's turn
    await new Promise(r => setTimeout(r, 5));
    expect(cStarted).toBe(false);
    b!.end(false);
    expect(await c).not.toBeNull();
    // the late wrong code counted against the attacker's network, not the victim's
    for (let i = 0; i < 2; i++) await attempt(gate, 'a@x.com', 'attacker', true);
    expect(await attempt(gate, 'a@x.com', 'attacker', false)).toBe(false);
    expect(await attempt(gate, 'a@x.com', 'victim', false)).toBe(true);
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
