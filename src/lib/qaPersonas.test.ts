import { describe, expect, it } from 'vitest';
import { bannerText, groupPersonas, parsePersonaList, planBadge, type QaPersonaRow } from './qaPersonas.js';

const row = (id: string, group: string): QaPersonaRow => ({ id, name: id.toUpperCase(), group, plan: 'free', planStatus: null, scenario: 's', tryThis: 't' });

describe('QA test account list', () => {
  it('orders groups Plans, Limits, Data volume, Features, an unknown one last, and keeps the order inside a group', () => {
    const out = groupPersonas([row('f1', 'Features'), row('x1', 'Mystery'), row('p1', 'Plans'), row('d1', 'Data volume'), row('p2', 'Plans'), row('l1', 'Limits')]);
    expect(out.map(g => g.group)).toEqual(['Plans', 'Limits', 'Data volume', 'Features', 'Mystery']);
    expect(out[0]!.items.map(i => i.id)).toEqual(['p1', 'p2']);
  });
  it('gives no groups for no personas', () => { expect(groupPersonas([])).toEqual([]); });
  it('names the plan, and says past due', () => {
    expect(planBadge('paid', null)).toBe('Paid');
    expect(planBadge('paid', 'past_due')).toBe('Paid, past due');
    expect(planBadge('lifetime', null)).toBe('Lifetime');
    expect(planBadge('odd', null)).toBe('odd');
  });
  it('words the banner', () => { expect(bannerText('Paid, past due')).toBe('QA test account: Paid, past due'); });
  it('reads the server answer and drops rows that are not personas', () => {
    const out = parsePersonaList({ ok: true, current: 'founder', personas: [{ id: 'founder', name: 'Founder', group: 'Plans', plan: 'founder', planStatus: null, scenario: 'a', tryThis: 'b' }, { id: 5 }, null, 'x'] });
    expect(out?.current).toBe('founder');
    expect(out?.personas).toHaveLength(1);
    expect(out?.personas[0]).toMatchObject({ id: 'founder', group: 'Plans', planStatus: null });
  });
  it('answers null for anything that is not the list', () => {
    for (const bad of [null, undefined, 'x', 5, {}, { personas: 'no' }]) expect(parsePersonaList(bad)).toBeNull();
  });
});
