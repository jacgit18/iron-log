import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PiiCrypto } from '../auth/piiCrypto.ts';
import { startTestDatabase } from '../test/postgres.ts';
import { personaById } from './personas.ts';
import { buildPersonaRows } from './seedPlan.ts';
import { SEED_EXERCISE_IDS, seedPersona } from './seedPersona.ts';

// The real seed against a real database (QA data for the vitamin and mineral features): the vitamin persona's supplements, ticks, food amounts and ready-made food go in through the migrations' own checks, and a re-run puts back exactly the same rows.
const CLEAR: PiiCrypto = { seal: x => x, sealStable: x => x, open: x => x, isSealed: () => false };
const TODAY = new Date('2026-11-09T12:00:00Z');
let t: Awaited<ReturnType<typeof startTestDatabase>>; let client: pg.Client;
beforeAll(async () => { t = await startTestDatabase(); client = new pg.Client({ connectionString: t.url }); await client.connect(); }, 120_000);
afterAll(async () => { await client.end(); await t.stop(); });

const counts = async () => {
  const q = async (text: string) => Number((await client.query(text)).rows[0].n);
  return {
    supplements: await q(`select count(*) n from list_items where list = 'supplement_item'`),
    ticks: await q(`select count(*) n from supplement_days`),
    foodWithAmounts: await q(`select count(*) n from list_items where list = 'diet_entry' and data ? 'micro'`),
    readyMade: await q(`select count(*) n from list_items where list = 'recipe' and data ->> 'cat' = 'ready' and data ? 'micro'`),
  };
};

describe('seeding the vitamin tracker', () => {
  const p = personaById('vitamin-tracker')!;
  const run = () => seedPersona(client, CLEAR, p, buildPersonaRows(p, SEED_EXERCISE_IDS, TODAY), TODAY);

  it('writes the supplements, the tick days, the foods with amounts and the ready-made food, and again on a re-run', async () => {
    await run();
    const first = await counts();
    expect(first).toMatchObject({ supplements: 7, ticks: 5, readyMade: 1 });
    expect(first.foodWithAmounts).toBeGreaterThan(10); // oatmeal, chicken and salmon on each of 7 days
    await run();
    expect(await counts()).toEqual(first);
  }, 60_000);

  it('stores a tick day as the app reads it: item ids as keys, and the supplement ids exist', async () => {
    await run();
    const ids = new Set((await client.query(`select client_id from list_items where list = 'supplement_item'`)).rows.map(r => r.client_id as string));
    const days = (await client.query(`select day::text, taken from supplement_days order by day desc`)).rows;
    expect(days[0].day).toBe('2026-11-09');
    for (const d of days) for (const id of Object.keys(d.taken)) expect(ids.has(id), id).toBe(true);
  }, 60_000);
});
