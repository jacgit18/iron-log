import { describe, expect, it } from 'vitest';
import { DEFAULT_STRETCHES } from '../src/lib/stretches.ts';
import { personaById } from '../server/qa/personas.ts';
import { buildPersonaRows } from '../server/qa/seedPlan.ts';

// The seed copies the app's default stretch routine because server/ may import only src/shared (ADR 015). An account with one stretch row shows only that row, so the copy has to match the defaults:
// this fails when src/lib/stretches.ts changes and the seed does not.
const pick = (s: { id: string; n: string; group: string; tier: string; url?: string; note?: string }) => ({ id: s.id, n: s.n, group: s.group, tier: s.tier, ...(s.url ? { url: s.url } : {}), ...(s.note ? { note: s.note } : {}) });

describe('the recipe collector seed keeps the default stretch routine', () => {
  it('seeds every default stretch exactly, then its own', () => {
    const rows = buildPersonaRows(personaById('recipe-collector')!, ['latpd'], new Date('2026-11-13T12:00:00Z')).stretches;
    expect(rows.slice(0, DEFAULT_STRETCHES.length).map(r => r.data)).toEqual(DEFAULT_STRETCHES.map(pick));
    expect(rows).toHaveLength(DEFAULT_STRETCHES.length + 1);
    expect(rows.every(r => r.clientId === r.data.id)).toBe(true);
    expect(new Set(rows.map(r => r.data.id)).size).toBe(rows.length);
  });
  it('gives no other account a stretch row, so they keep showing the defaults', () => {
    for (const id of ['diet-on-target', 'meal-planner', 'superset-builder']) expect(buildPersonaRows(personaById(id)!, ['latpd'], new Date('2026-11-13T12:00:00Z')).stretches).toEqual([]);
  });
});
