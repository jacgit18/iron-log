import { describe, expect, it } from 'vitest';
import { bannerText, filterPersonas, groupChips, groupPersonas, missingIds, parsePersonaList, parseRecent, hasQaLink, NO_SCENARIOS, planBadge, pushRecent, qaEntries, qaHighlightOf, qaLinkAllowed, qaLinkFromSearch, qaLinkTarget, recentRows, rowState, scenarioTag, searchWithoutQaLink, seededWord, youAre, type QaPersonaRow } from './qaPersonas.js';

const row = (id: string, group: string): QaPersonaRow => ({ id, name: id.toUpperCase(), group, plan: 'free', planStatus: null, scenario: 's', tryThis: 't', seeded: true, scenarios: [] });

describe('QA test account list', () => {
  it('orders groups Plans, Limits, Data volume, Features, Diet, an unknown one last, and keeps the order inside a group', () => {
    const out = groupPersonas([row('f1', 'Features'), row('x1', 'Mystery'), row('p1', 'Plans'), row('d1', 'Data volume'), row('di1', 'Diet'), row('p2', 'Plans'), row('l1', 'Limits')]);
    expect(out.map(g => g.group)).toEqual(['Plans', 'Limits', 'Data volume', 'Features', 'Diet', 'Mystery']);
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

  it('reads seeded and canReset, treating a missing seeded as seeded (an older server)', () => {
    const base = { name: 'A', group: 'Plans', plan: 'free', planStatus: null, scenario: 'a', tryThis: 'b' };
    const out = parsePersonaList({ canReset: true, personas: [{ id: 'a', ...base, seeded: false }, { id: 'b', ...base }] });
    expect(out?.canReset).toBe(true);
    expect(out?.personas.map(p => p.seeded)).toEqual([false, true]);
    expect(parsePersonaList({ personas: [] })?.canReset).toBe(false);
  });
});

describe('the picker rules', () => {
  const rows: QaPersonaRow[] = [
    { ...row('a', 'Plans'), name: 'Paid, monthly', scenario: 'Active subscription', tryThis: 'Billing screen' },
    { ...row('b', 'Diet'), name: 'Meal planner', scenario: 'A 7-day plan', tryThis: 'Portions and copying', seeded: false },
    { ...row('c', 'Diet'), name: 'Recipe collector', scenario: 'About 30 recipes', tryThis: 'The Maybe matches' },
  ];

  it('shows the menu row to an admin on their own account and the banner button on a test account, nothing elsewhere', () => {
    expect(qaEntries({ persona: null, canSwitch: true })).toEqual({ menuRow: true, bannerSwitch: false });
    expect(qaEntries({ persona: 'Founder', canSwitch: false })).toEqual({ menuRow: false, bannerSwitch: true });
    expect(qaEntries({ persona: null, canSwitch: false })).toEqual({ menuRow: false, bannerSwitch: false });
    expect(qaEntries(undefined)).toEqual({ menuRow: false, bannerSwitch: false });
  });
  it('lists All then the groups present', () => { expect(groupChips(rows)).toEqual(['All', 'Plans', 'Diet']); });
  it('searches name, scenario and try-this text without regard to case, and narrows by group', () => {
    expect(filterPersonas(rows, 'MEAL', 'All').map(r => r.id)).toEqual(['b']);
    expect(filterPersonas(rows, 'subscription', 'All').map(r => r.id)).toEqual(['a']);
    expect(filterPersonas(rows, 'maybe', 'All').map(r => r.id)).toEqual(['c']);
    expect(filterPersonas(rows, '', 'Diet').map(r => r.id)).toEqual(['b', 'c']);
    expect(filterPersonas(rows, 'meal', 'Plans')).toEqual([]);
    expect(filterPersonas(rows, '  ', 'All')).toHaveLength(3);
  });
  it('searches the ids and titles of the QA scenarios too', () => {
    const tagged: QaPersonaRow[] = [
      { ...row('a', 'Diet'), name: 'Meal planner', scenarios: [{ id: 'S-07', title: 'Read a planned day' }, { id: 'S-09', title: 'Plan to Groceries' }] },
      { ...row('b', 'Diet'), name: 'Recipe collector', scenarios: [{ id: 'S-21', title: 'Nutrition badges' }] },
      row('c', 'Plans'),
    ];
    expect(filterPersonas(tagged, 's-09', 'All').map(r => r.id)).toEqual(['a']);
    expect(filterPersonas(tagged, 'badges', 'All').map(r => r.id)).toEqual(['b']);
    expect(filterPersonas(tagged, 'groceries', 'Plans')).toEqual([]);
  });
  it('writes the tag line from the scenario ids, and none for an account without scenarios', () => {
    expect(scenarioTag({ scenarios: [{ id: 'S-04', title: 'x' }, { id: 'S-11', title: 'y' }] })).toBe('Used in S-04, S-11');
    expect(scenarioTag({ scenarios: [] })).toBeNull();
    expect(NO_SCENARIOS).toBe('No scenarios yet');
  });
  it('reads the scenarios of a row, and none from an old server or a malformed list', () => {
    const base = { name: 'N', group: 'Diet', plan: 'free', scenario: 's', tryThis: 't' };
    const out = parsePersonaList({ personas: [{ id: 'a', ...base, scenarios: [{ id: 'S-01', title: 'One' }, { id: 5, title: 'bad' }, null, { id: 'S-02' }] }, { id: 'b', ...base }, { id: 'c', ...base, scenarios: 'x' }] });
    expect(out?.personas.map(p => p.scenarios)).toEqual([[{ id: 'S-01', title: 'One' }], [], []]);
  });
  it('keeps the last three switches, newest first, with no repeats', () => {
    expect(pushRecent(pushRecent(pushRecent(pushRecent([], 'a'), 'b'), 'c'), 'd')).toEqual(['d', 'c', 'b']);
    expect(pushRecent(['b', 'a'], 'a')).toEqual(['a', 'b']);
    expect(recentRows(rows, ['c', 'zzz', 'a']).map(r => r.id)).toEqual(['c', 'a']);
  });
  it('reads a saved recent list and survives junk', () => {
    expect(parseRecent(['a', 'b'])).toEqual(['a', 'b']);
    for (const bad of [null, undefined, '', 'text', { a: 1 }, 5]) expect(parseRecent(bad)).toEqual([]);
    expect(parseRecent(['a', 3, 'b', 'c', 'd'])).toEqual(['a', 'b', 'c']);
  });
  it('disables Switch on the current or an unseeded account, and Reset on the current one, and names Seed for an unseeded one', () => {
    expect(rowState(rows[0]!, 'a', true)).toMatchObject({ current: true, canSwitch: false, canReset: false, hint: 'Switch away to reset it' });
    expect(rowState(rows[1]!, 'a', true)).toMatchObject({ canSwitch: false, canReset: true, resetLabel: 'Seed', hint: 'Seed it first' });
    expect(rowState(rows[2]!, 'a', true)).toMatchObject({ canSwitch: true, canReset: true, resetLabel: 'Reset', hint: null });
    expect(rowState(rows[2]!, null, false).canReset).toBe(false); // the server has no owner URL
  });
  it('lists the accounts to seed, never the one you are on', () => {
    expect(missingIds(rows, null)).toEqual(['b']);
    expect(missingIds(rows, 'b')).toEqual([]);
  });
  it('words the line and the dot', () => {
    expect(youAre(rows, 'c')).toBe('You are: Recipe collector');
    expect(youAre(rows, null)).toBe('You are: your own account');
    expect(seededWord(true)).toBe('Seeded');
    expect(seededWord(false)).toBe('Not seeded');
  });
});

describe('the /?qa=<id> link', () => {
  it('reads an account id and refuses anything that is not a plausible one', () => {
    expect(qaLinkFromSearch('?qa=meal-planner')).toBe('meal-planner');
    expect(qaLinkFromSearch('?x=1&qa=diet-fresh')).toBe('diet-fresh');
    for (const bad of ['', '?qa=', '?qa=Meal-Planner', '?qa=a%20b', '?qa=../etc', '?qa=<script>', `?qa=${'a'.repeat(41)}`, '?other=meal-planner']) expect(qaLinkFromSearch(bad), bad).toBeNull();
    expect(qaLinkFromSearch(`?qa=${'a'.repeat(40)}`)).toBe('a'.repeat(40));
  });
  it('notices the parameter even when its value is refused, and removes only that parameter', () => {
    expect(hasQaLink('?qa=')).toBe(true);
    expect(hasQaLink('?qa=<x>')).toBe(true);
    expect(hasQaLink('?open=daily')).toBe(false);
    expect(searchWithoutQaLink('?qa=meal-planner')).toBe('');
    expect(searchWithoutQaLink('?qa=')).toBe('');
    expect(searchWithoutQaLink('?open=daily&qa=meal-planner')).toBe('?open=daily');
    expect(searchWithoutQaLink('')).toBe('');
  });
  it('may open the picker where its entries show: an admin on their own account, or a test account with the way back', () => {
    expect(qaLinkAllowed({ persona: null, canSwitch: true })).toBe(true);
    expect(qaLinkAllowed({ persona: 'Founder', canSwitch: false })).toBe(true);
    expect(qaLinkAllowed({ persona: null, canSwitch: false })).toBe(false);
    expect(qaLinkAllowed(undefined)).toBe(false);
  });
  it('marks the held account only when the list has it', () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    expect(qaLinkTarget('b', rows)).toBe('b');
    expect(qaLinkTarget('zzz', rows)).toBeNull();
    expect(qaLinkTarget(null, rows)).toBeNull();
    expect(qaLinkTarget('a', [])).toBeNull();
  });
  it('reads the account a picker modal was opened to mark', () => {
    expect(qaHighlightOf({ highlight: 'meal-planner' })).toBe('meal-planner');
    expect(qaHighlightOf({ highlight: 'Bad Id' })).toBeNull();
    expect(qaHighlightOf({ highlight: 5 })).toBeNull();
    expect(qaHighlightOf({})).toBeNull();
    expect(qaHighlightOf(null)).toBeNull();
  });
});
