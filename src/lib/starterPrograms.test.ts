import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ProgramCfg } from '../types.ts';
import { buildStarter, starterById, STARTERS } from './starterPrograms.js';
import { listBuiltinExercises, slotsFor } from './data.js';

const cfg = (ex: ProgramCfg['ex'] = {}): ProgramCfg => ({ ex });

// A signed-in account lists no built-in exercises (ADR 024): everything it uses must be in its own library.
beforeEach(() => listBuiltinExercises(false));
afterEach(() => listBuiltinExercises(true));

describe('starter programs', () => {
  it('every starter builds seven days on every days-per-week it offers, with that many non-empty days', () => {
    for (const s of STARTERS) for (const n of s.perWeek) {
      const b = buildStarter(s, n, cfg(), 'A', '2026-10-11')!;
      expect(b.program.days).toHaveLength(7);
      expect(b.program.days.filter(d => d.slots.length).length).toBe(n);
      // the first n days are the ones filled, in order
      b.program.days.slice(0, n).forEach(d => expect(d.slots.length).toBeGreaterThan(0));
    }
  });

  it('refuses a days-per-week the starter does not offer', () => {
    expect(buildStarter(starterById('fivebyfive')!, 5, cfg(), 'A', '2026-10-11')).toBeNull();
  });

  it('repeats the sessions in order: full body 3 days is A, B, A', () => {
    const b = buildStarter(starterById('fullbody')!, 3, cfg(), 'A', '2026-10-11')!;
    expect(b.program.days.slice(0, 3).map(d => d.slots[0]!.sec)).toEqual(['Full body A', 'Full body B', 'Full body A']);
  });

  it('gives every card a unique id under the program key, a start week, a prescription and no weight', () => {
    const b = buildStarter(starterById('ppl')!, 6, cfg(), 'B', '2026-10-11')!;
    const cards = slotsFor(b.program);
    expect(new Set(cards.map(c => c.id)).size).toBe(cards.length);
    for (const c of cards) {
      expect(c.id.startsWith('B-d')).toBe(true);
      expect(c.from).toBe('2026-10-11');
      expect(c.items[0]!.w).toBeNull();
      expect(c.items[0]!.rx).toMatch(/\d/);
    }
  });

  it('every exercise a card uses is either new (with equipment and muscles) or already in the library', () => {
    for (const s of STARTERS) {
      const b = buildStarter(s, s.perWeek[0]!, cfg(), 'A', '2026-10-11')!;
      for (const c of slotsFor(b.program)) for (const it of c.items) {
        expect(b.newEx[it.ex]).toBeDefined();
        expect(b.newEx[it.ex]!.n).toBeTruthy();
        expect(b.newEx[it.ex]!.eq).toBeTruthy();
        expect(b.newTags[it.ex]!.p!.length).toBeGreaterThan(0);
      }
    }
  });

  it('uses an exercise the account already has under that name, and adds nothing for it', () => {
    const b = buildStarter(starterById('fivebyfive')!, 3, cfg({ mysquat: { n: 'squat' } }), 'A', '2026-10-11')!;
    expect(b.newEx.mysquat).toBeUndefined();
    expect(slotsFor(b.program).some(c => c.items[0]!.ex === 'mysquat')).toBe(true);
    // every Squat card, on every day, uses that one id: none made a second squat
    const squatCards = slotsFor(b.program).filter(c => c.sec?.startsWith('Workout'));
    expect(squatCards.length).toBeGreaterThan(1);
    const squatIds = slotsFor(b.program).flatMap(c => c.items.map(it => it.ex)).filter(id => id === 'mysquat' || b.newEx[id]?.n === 'Squat');
    expect(new Set(squatIds)).toEqual(new Set(['mysquat']));
  });

  it('one exercise used on several days has one library entry', () => {
    const b = buildStarter(starterById('fullbody')!, 3, cfg(), 'A', '2026-10-11')!;
    const names = Object.values(b.newEx).map(e => e.n);
    expect(new Set(names).size).toBe(names.length);
  });
});
