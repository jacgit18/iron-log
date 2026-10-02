# Experiment Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standing "Experiments" list under the board, shared across weeks and programs, whose entries can be added to any day of the viewed week as a normal card for that week only.

**Architecture:** Entries live in their own document (`experiments/main`), like saved program versions. Adding one to a day appends a card to the week's own record (`week.extra`), stored by program day. One function, `weekSlots(prog, week)`, merges the program's cards with the week's extra cards, and every week-level consumer (store actions, board, stats, Muscles live view, exports) reads it, so check-offs, logs, moves, skips and swaps work unchanged.

**Tech Stack:** React 19, zustand, vitest (Node, no DOM), SheetJS (`xlsx`), oxlint.

**Spec:** [docs/superpowers/specs/2026-10-02-experiment-board-design.md](../specs/2026-10-02-experiment-board-design.md)

## Global Constraints

- Branch `experiment-board` (already created from `main`); one commit per task; commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Entry shape `{ id, ex, ph, note }`: `id` a non-empty string, `ex` a non-empty exercise id, `ph` a phase key or `null`, `note` a string (may be empty).
- Week card shape in `week.extra`: `{ id, day, ex, ph, note }`; `id` matches `/^X-[\w-]{1,60}$/`; `day` an integer 1..7 (program day, like `week.moved`); `normWeek` keeps only valid cards, de-duplicates by id, and omits the field when empty. Never `null`.
- As a slot, an extra card is `{ id, day, type: 'single', sec: 'Experiment', experiment: true, items: [{ ex, ph }] }` plus `note` only when non-empty.
- Program-only views (Program tab, Settings 1RM table) keep `slotsFor`; every week-level consumer uses `weekSlots(prog, week)`.
- Deleting an entry never changes weeks. Removing a card from a week clears its done/skip/move/phase keys and its check-off's auto log; hand-entered logs stay.
- Excel: an optional `Experiments` sheet (`Id`, `Exercise id`, `Exercise`, `Phase`, `Note`, phase written as its key); a workbook without it still imports as a full backup. Week cards are `extra` rows in `Check-offs` whose value is the card as JSON text.
- Import "replace" replaces the list; "merge" adds entries with new ids. `mergeWeek` unions `extra` by id, this device first. The week fingerprint includes the normalized `extra`. Erase "programs" also clears the list.
- WCAG 2.2 AAA: real buttons and labelled selects, 44 px targets, names include the exercise and start with the visible text ("Add Cable Lateral Raise to Day 3"), the panel is a labelled section, drag is never required.
- Code style: match the surrounding code (dense one-liners, comments only for non-obvious rules). Tests: `npx vitest run <file>`; all `npm test`; lint `npm run lint`; build `npm run build`.

## Review Focus

1. A malformed `week.extra` or entry list (hand-edited JSON, a bad Excel cell, a merged device) must be dropped without crashing the board or hiding program cards. Tests in Tasks 1 and 4.
2. Removing an added card must not leave orphaned keys (`done`, `skipped`, `moved`, `ph`) or auto logs, and must keep hand logs. Test in Task 2.
3. Every week-level count must include added cards (tally, day completion, `weekSummary`, Muscles live, Plan sheet, check-offs rebuilt from an Excel import). Tests in Tasks 2 and 3.
4. Old data with no experiments (JSON without the key, a workbook without the sheet, a week without `extra`) must import and display unchanged. Tests in Task 4.
5. Adding to a day after swaps or with a rest day lands on the workout shown in that column; the rest column is refused. Test in Task 2.

---

### Task 1: `weekSlots`, extra cards and their validation

**Files:**
- Modify: `src/lib/logic.js` (import `slotsFor`; new `extraSlots`, `weekSlots`; `normWeek`)
- Test: `src/lib/logic.test.js`

**Interfaces:**
- Produces: `extraSlots(week)` → slot objects for `week.extra`; `weekSlots(prog, week)` → `[...slotsFor(prog), ...extraSlots(normWeek(week))]`; `normWeek` keeps a validated `extra`.

- [ ] **Step 1: Write the failing tests**

Add `weekSlots` to the `./logic.js` import in `src/lib/logic.test.js` and append:

```js
describe('experiment cards on a week', () => {
  const prog = { key: 'T', days: [{ slots: [{ id: 'p1', items: [{ ex: 'hack' }] }] }, ...Array.from({ length: 6 }, () => ({ slots: [] }))] };
  const x = { id: 'X-a1', day: 3, ex: 'legext', ph: 'hyp', note: 'try light' };

  it('weekSlots adds the week’s experiment cards after the program’s', () => {
    const s = weekSlots(prog, { extra: [x] });
    expect(s.map(c => c.id)).toEqual(['p1', 'X-a1']);
    expect(s[1]).toEqual({ id: 'X-a1', day: 3, type: 'single', sec: 'Experiment', experiment: true, items: [{ ex: 'legext', ph: 'hyp' }], note: 'try light' });
  });
  it('weekSlots without extras is the program’s cards; an empty note is left off', () => {
    expect(weekSlots(prog, {}).map(c => c.id)).toEqual(['p1']);
    expect(weekSlots(prog, null).map(c => c.id)).toEqual(['p1']);
    expect(weekSlots(prog, { extra: [{ ...x, note: '' }] })[1]).not.toHaveProperty('note');
  });
  it('normWeek keeps valid experiment cards and drops malformed ones', () => {
    const bad = [{ ...x, id: 'nope' }, { ...x, id: 'X-b', day: 8 }, { ...x, id: 'X-c', ex: '' }, { ...x, id: 'X-d', ph: 'zzz' }, { ...x, id: 'X-e', note: 5 }, { ...x, id: 'X-f', day: '3' }, null, 'x'];
    expect(normWeek({ extra: [x, ...bad] }).extra).toEqual([x]);
    expect(normWeek({ extra: [{ id: 'X-g', day: 2, ex: 'hack' }] }).extra).toEqual([{ id: 'X-g', day: 2, ex: 'hack', ph: null, note: '' }]);
    expect(normWeek({ extra: [x, { ...x, note: 'dup' }] }).extra).toEqual([x]);
    expect(normWeek({ extra: [] })).not.toHaveProperty('extra');
    expect(normWeek({ extra: 'x' })).not.toHaveProperty('extra');
    expect(normWeek({})).not.toHaveProperty('extra');
  });
  it('experiment cards lay out by program day, so they follow the rest-day shift', () => {
    const w = normWeek({ extra: [x], rest: 2 });
    expect(currentLayout(w, weekSlots(prog, w))[4].map(c => c.id)).toEqual(['X-a1']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/logic.test.js`
Expected: FAIL (`weekSlots is not a function`).

- [ ] **Step 3: Implement**

In `src/lib/logic.js` change line 1 to also import `slotsFor` from `./data.js` (keep the existing names). Add, near the other day/layout helpers (after `currentLayout`):

```js
/* ---------- Experiment cards (week.extra) ---------- */
const isExtra = x => !!x && typeof x.id === 'string' && /^X-[\w-]{1,60}$/.test(x.id) && Number.isInteger(x.day) && x.day >= 1 && x.day <= DAY_COUNT && typeof x.ex === 'string' && x.ex !== '' && (x.ph == null || PH_KEYS.includes(x.ph)) && (x.note == null || typeof x.note === 'string');
export const extraSlots = w => (w.extra || []).map(x => ({ id: x.id, day: x.day, type: 'single', sec: 'Experiment', experiment: true, items: [{ ex: x.ex, ph: x.ph }], ...(x.note ? { note: x.note } : {}) }));
// The week's cards: the program's, then the experiment cards added to this week.
export const weekSlots = (prog, w) => [...slotsFor(prog), ...extraSlots(normWeek(w))];
```

In `normWeek`, before `return out;` add:

```js
  if (Array.isArray(w && w.extra)) { const seen = new Set(); const ex = w.extra.filter(x => isExtra(x) && !seen.has(x.id) && seen.add(x.id)).map(x => ({ id: x.id, day: x.day, ex: x.ex, ph: x.ph ?? null, note: x.note || '' })); if (ex.length) out.extra = ex; }
```

- [ ] **Step 4: Run the tests**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/logic.js src/lib/logic.test.js
git commit -m "weekSlots: a week's cards are the program's plus its experiment cards"
```

---

### Task 2: Store: the list, adding to a day, removing a card

**Files:**
- Modify: `src/lib/data.js` (new `newExId`)
- Modify: `src/store/editorSlice.js` (`saveSlot` uses `newExId`)
- Modify: `src/store/useAppStore.js` (state, ready flag, load/save, snapshot, `activeSlots`, actions, erase)
- Test: `src/store/useAppStore.test.js`

**Interfaces:**
- Consumes: `weekSlots`, `dayAt`, `clearDone` (logic.js).
- Produces: store state `experiments` (array) and ready flag `exp`; `saveExperiments()`; `setExperiments(list)`; `saveExperiment({ id?, ex | '__new', nn?, nu?, ph, note })` → error string or `null`; `deleteExperiment(id)`; `addToDay(entryId, column)` → boolean; `removeExtra(slotId)`; `activeSlots()` now returns `weekSlots(activeProgram, week)`; `snapshot()` includes `experiments`; `newExId(cfg, name, taken)` in data.js.

- [ ] **Step 1: Write the failing tests**

In `src/store/useAppStore.test.js`: add `tally` to the dynamic `../lib/logic.js` import (follow how `currentLayout` is imported there) and append:

```js
describe('experiment board', () => {
  beforeEach(() => useAppStore.setState({ experiments: [] }));
  const add = (ex = 'hack', ph = 'hyp', note = '') => { st().saveExperiment({ ex, ph, note }); return st().experiments.at(-1); };

  it('adds, edits and deletes entries, and saves them', () => {
    const e = add('hack', 'hyp', 'try light');
    expect(e).toMatchObject({ ex: 'hack', ph: 'hyp', note: 'try light' });
    expect(saved('experiments/main').items).toHaveLength(1);
    st().saveExperiment({ id: e.id, ex: 'hack', ph: 'strength', note: '' });
    expect(st().experiments).toEqual([{ id: e.id, ex: 'hack', ph: 'strength', note: '' }]);
    st().deleteExperiment(e.id);
    expect(st().experiments).toEqual([]);
    expect(saved('experiments/main').items).toEqual([]);
  });
  it('creates a new exercise from a typed name, and asks for one when missing', () => {
    expect(st().saveExperiment({ ex: '__new', nn: 'Cable Lateral Raise', ph: null, note: '' })).toBeNull();
    const e = st().experiments.at(-1);
    expect(st().cfg.ex[e.ex].n).toBe('Cable Lateral Raise');
    expect(st().saveExperiment({ ex: '__new', nn: '' })).toMatch(/Choose an exercise/);
    expect(st().saveExperiment({ ex: '' })).toMatch(/Choose an exercise/);
  });
  it('adds an entry to a day of this week as a card that follows swaps, and keeps the entry', () => {
    const e = add();
    st().swapDays(6, 1); // column 7 shows the Day 6 workout
    expect(st().addToDay(e.id, 7)).toBe(true);
    const x = st().week.extra[0];
    expect(x).toMatchObject({ day: 6, ex: 'hack', ph: 'hyp' });
    expect(x.id).toMatch(/^X-/);
    expect(currentLayout(st().week, st().activeSlots())[7].map(s => s.id)).toContain(x.id);
    expect(saved('weeks/' + st().weekKey()).extra).toHaveLength(1);
    expect(st().experiments).toHaveLength(1);
  });
  it('refuses the rest day', () => {
    const e = add(); st().setRestDay(3);
    expect(st().addToDay(e.id, 3)).toBe(false);
    expect(st().week.extra).toBeUndefined();
  });
  it('an added card counts, checks off with a planned log, and Remove undoes it all', () => {
    const e = add('legext', 'hyp');
    const before = tally(st().activeSlots(), st().week).total;
    st().addToDay(e.id, 2);
    const id = st().week.extra[0].id;
    expect(tally(st().activeSlots(), st().week).total).toBe(before + 1);
    st().checkCard(id, true);
    st().setPhase(id, 0, 'strength');
    expect(st().logs.legext.some(x => x.slot === id && x.auto)).toBe(true);
    st().removeExtra(id);
    expect(st().week.extra).toBeUndefined();
    expect(st().week.done[id]).toBeUndefined();
    expect(st().week.ph[`${id}:0`]).toBeUndefined();
    expect((st().logs.legext || []).some(x => x.slot === id)).toBe(false);
    expect(tally(st().activeSlots(), st().week).total).toBe(before);
  });
  it('Remove keeps sets you logged by hand', () => {
    const e = add('legext', 'hyp'); st().addToDay(e.id, 2); const id = st().week.extra[0].id; const wk = st().weekKey();
    st().submitLog(id, 0, { entry: { d: wk, ph: 'hyp', w: 50, s: 3, r: 12, slot: id, wk }, ph: 'hyp', done: true });
    st().removeExtra(id);
    expect(st().logs.legext.some(x => x.slot === id && !x.auto)).toBe(true);
  });
  it('Remove only works on experiment cards', () => {
    st().removeExtra('A-d1s1');
    expect(st().activeSlots().some(s => s.id === 'A-d1s1')).toBe(true);
  });
  it('deleting an entry leaves the cards already added', () => {
    const e = add(); st().addToDay(e.id, 2); st().deleteExperiment(e.id);
    expect(st().week.extra).toHaveLength(1);
  });
  it('Erase programs clears the list', async () => {
    add(); await st().eraseData({ programs: true });
    expect(st().experiments).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/store/useAppStore.test.js`
Expected: FAIL (`saveExperiment is not a function`).

- [ ] **Step 3: Implement**

`src/lib/data.js`, append (it moves the slug rule out of `saveSlot` so both sheets share it):

```js
// A new custom exercise's id from its name, unique among the built-ins and cfg.ex (`taken` adds ids being created now).
export function newExId(cfg, name, taken = {}) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'exercise';
  const known = { ...cfg.ex, ...taken }; let id = base, n = 2;
  while (EX[id] || (known[id] && known[id].n !== name)) id = `${base}-${n++}`;
  return id;
}
```

`src/store/editorSlice.js`: import `newExId` from `../lib/data.js` and replace the body of the local `slugFor` with `const slugFor = name => newExId(get().cfg, name, newEx);` (remove the now-unused lines; keep `EX` in the import only if still used elsewhere in the file — check with grep).

`src/store/useAppStore.js`:
- Import `weekSlots`, `clearDone` (if not already), `dayAt` from `../lib/logic.js`; `exInfo`, `newExId` from `../lib/data.js` (merge into existing imports; read them first).
- Add a module-level helper near the top: `const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);`
- State: after `library: [],` add `experiments: [], // exercises to try: [{id, ex, ph, note}]`; add `exp: false` to the initial `ready` object; add `&& r.exp` to `isReady`.
- `snapshot`: add `experiments: s.experiments`.
- `activeSlots: () => weekSlots(get().activeProgram(), get().week),`
- Next to `saveLibrary` add `saveExperiments() { queue.save('experiments/main', { items: get().experiments }); },`
- Load, local mode: in the `set(state => ({ storeMode: 'local', … }))` call add `experiments: (LS.get('experiments/main') || {}).items || [],` and `exp: true` in its `ready`. Db mode: after the `library/main` subscription add:
  ```js
  db.doc('experiments/main').onSnapshot(s => {
    if (s.metadata.hasPendingWrites) return;
    set(state => ({ experiments: s.exists ? [...((s.data() || {}).items || [])] : [], ...markReady('exp')(state) }));
  }, () => flag('Couldn’t load your experiments. Reload the page.'));
  ```
- Actions (place after `moveCards`):
  ```js
  // Experiment board: a list of exercises to try, added to a day of the viewed week as a card for that week.
  setExperiments(experiments) { set({ experiments }); get().saveExperiments(); },
  saveExperiment(d) {
    if (get().blocked()) return null;
    if (!d.ex || (d.ex === '__new' && !d.nn)) return 'Choose an exercise, or type a name for the new one.';
    if (d.ex === '__new' && d.nu && !/^https?:\/\//.test(d.nu)) return 'Video link should start with https://';
    let ex = d.ex;
    if (ex === '__new') { ex = newExId(get().cfg, d.nn); get().mutateCfg(c => { c.ex[ex] = { n: d.nn, ...(d.nu ? { url: d.nu } : {}) }; }); }
    const item = { id: d.id || uid('E'), ex, ph: d.ph || null, note: (d.note || '').trim() };
    const list = get().experiments;
    get().setExperiments(d.id ? list.map(x => (x.id === d.id ? item : x)) : [...list, item]);
    set({ modal: null }); flag('Saved'); return null;
  },
  deleteExperiment(id) { if (get().blocked()) return; get().setExperiments(get().experiments.filter(x => x.id !== id)); flag('Deleted'); },
  addToDay(entryId, col) {
    const e = get().experiments.find(x => x.id === entryId); if (!e) return false;
    const pd = dayAt(get().week, col); if (pd == null) { flag('That is your rest day'); return false; }
    const ok = get().mutateWeek(w => { w.extra = [...(w.extra || []), { id: uid('X-'), day: pd, ex: e.ex, ph: e.ph ?? null, note: e.note || '' }]; });
    if (ok) flag(`Added ${exInfo(get().cfg, e.ex).n} to Day ${col}`);
    return ok;
  },
  removeExtra(slotId) {
    const s = get().slotById(slotId); if (!s || !s.experiment) return;
    const ok = get().mutateChecks(w => {
      clearDone(w, s); delete w.skipped[slotId]; delete w.moved[slotId]; delete w.ph[`${slotId}:0`];
      w.extra = (w.extra || []).filter(x => x.id !== slotId); if (!w.extra.length) delete w.extra;
    });
    if (!ok) return;
    if (get().moveNote && get().moveNote.slot === slotId) set({ moveNote: null });
    flag('Removed from this week');
  },
  ```
- `eraseData`, programs branch: also `experiments: []` in its `set`, and call `get().saveExperiments()`.

- [ ] **Step 4: Run the tests**

Run: `npm test && npm run lint`
Expected: PASS (including the existing editor tests, which cover the moved slug rule).

- [ ] **Step 5: Commit**

```bash
git add src/lib/data.js src/store/editorSlice.js src/store/useAppStore.js src/store/useAppStore.test.js
git commit -m "Store: experiment list, add to a day, remove from a week"
```

---

### Task 3: Week-level consumers read `weekSlots`

**Files:**
- Modify: `src/lib/trends.js` (`weekSummary`)
- Modify: `src/lib/muscles.js` (`muscleVolume`, live view)
- Modify: `src/lib/export.js` (`buildWeekWorkbook` Plan sheet)
- Modify: `src/lib/excelImport.js` (`checkOffsFromLogs`)
- Test: `src/lib/trends.test.js`, `src/lib/muscles.test.js`, `src/lib/export.test.js`, `src/lib/excelImport.test.js`

**Interfaces:**
- Consumes: `weekSlots(prog, week)` (Task 1).
- Produces: added cards count in weekly history and trends, the Muscles live view, the week workbook's Plan sheet, and check-offs rebuilt from an imported workbook's sessions.

- [ ] **Step 1: Write the failing tests**

`src/lib/trends.test.js`, inside `describe('weekSummary…')` (it has `cfg()` and `programs`; Day 2 holds card `c`):

```js
  it('counts experiment cards added to the week', () => {
    const w = { done: { 'X-1': true }, skipped: {}, moved: {}, extra: [{ id: 'X-1', day: 2, ex: 'legext', ph: null }] };
    const r = weekSummary(cfg(), programs, '2026-09-20', w);
    expect(r).toMatchObject({ ex: 1, total: 6 });
    expect(r.days[1]).toBe(1); // Day 2: c open, X-1 done
  });
```

`src/lib/muscles.test.js` (read its fixtures first: it has a small program `prog` whose Day 1 card is Hack Squat; use the file's existing `cfg`/`normWeek` setup and imports, adding what is missing):

```js
  it('the live view counts experiment cards added to the week; the plan view does not', () => {
    const base = muscleVolume(c, normWeek({}), prog, true, false).vol;
    const w = normWeek({ extra: [{ id: 'X-1', day: 2, ex: 'hack', ph: 'hyp' }] });
    const live = muscleVolume(c, w, prog, true, false).vol;
    const grew = Object.keys(live).filter(k => live[k].sets > base[k].sets);
    expect(grew.length).toBeGreaterThan(0);
    expect(live[grew[0]].ex.some(e => e.ex === 'hack' && e.day === 2)).toBe(true);
    expect(muscleVolume(c, w, prog, false, false).vol).toEqual(muscleVolume(c, normWeek({}), prog, false, false).vol);
  });
```

(`c` stands for the test file's config object; use whatever name it already has.)

`src/lib/export.test.js` (add imports as needed: `* as X from 'xlsx'`, `buildWeekWorkbook`, `BUILTIN`, `exInfo`, `DEFAULT_CFG`):

```js
it('the week workbook lists experiment cards on the Plan sheet', () => {
  const S = { cfg: structuredClone(DEFAULT_CFG), logs: {}, programs: { A: BUILTIN.A, B: BUILTIN.B }, library: [], body: [], experiments: [] };
  const w = { done: { 'X-1': true }, extra: [{ id: 'X-1', day: 2, ex: 'hack', ph: 'hyp' }] };
  const rows = X.utils.sheet_to_json(buildWeekWorkbook(X, S, '2026-09-27', w).Sheets.Plan, { header: 1 });
  expect(rows.some(r => r[2] === 'Experiment' && r[5] === exInfo(S.cfg, 'hack').n && r[9] === 'Yes')).toBe(true);
});
```

`src/lib/excelImport.test.js` (import `checkOffsFromLogs`, `DEFAULT_CFG`, `BUILTIN` if not already):

```js
it('rebuilds check-offs for experiment cards from logged sessions', () => {
  const logs = { hack: [{ d: '2026-09-29', slot: 'X-1', wk: '2026-09-27', w: 100, s: 3, r: 5 }] };
  const weeks = { '2026-09-27': { extra: [{ id: 'X-1', day: 2, ex: 'hack', ph: null }] } };
  const out = checkOffsFromLogs(structuredClone(DEFAULT_CFG), { A: BUILTIN.A, B: BUILTIN.B }, logs, weeks);
  expect(out['2026-09-27'].done['X-1']).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/trends.test.js src/lib/muscles.test.js src/lib/export.test.js src/lib/excelImport.test.js`
Expected: the four new tests FAIL (extra cards are not counted).

- [ ] **Step 3: Implement**

- `src/lib/trends.js`: import `weekSlots` from `./logic.js`; in `weekSummary` replace `const slots = slotsFor(prog);` with `const slots = weekSlots(prog, w);` (remove `slotsFor` from the data.js import if it becomes unused).
- `src/lib/muscles.js`: import `weekSlots` from `./logic.js`; in `muscleVolume` replace `slotsFor(prog).forEach(` with `(live ? weekSlots(prog, week) : slotsFor(prog)).forEach(`.
- `src/lib/export.js` `buildWeekWorkbook`: replace `const slots = slotsFor(programs[r.pk] || programs.A);` with `const slots = weekSlots(programs[r.pk] || programs.A, w);` and import `weekSlots`.
- `src/lib/excelImport.js` `checkOffsFromLogs`: replace `slotsFor(prog).find(x => x.id === e.slot)` with `weekSlots(prog, weeks[k] || {}).find(x => x.id === e.slot)` and import `weekSlots`.

Remove any import that becomes unused (grep each file).

- [ ] **Step 4: Run the tests**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trends.js src/lib/muscles.js src/lib/export.js src/lib/excelImport.js src/lib/trends.test.js src/lib/muscles.test.js src/lib/export.test.js src/lib/excelImport.test.js
git commit -m "Stats, Muscles, exports and Excel check-offs include experiment cards"
```

---

### Task 4: Back up, restore, merge and import

**Files:**
- Modify: `src/lib/logic.js` (new `normExperiments`)
- Modify: `src/lib/export.js` (`checkRows`, `addDataSheets`, `buildDataFile`, `normalizeData`, `mergeWeek`, `weekFingerprint`)
- Modify: `src/lib/excelImport.js` (`readWeeks`, `readDataSheets`, the non-full return)
- Modify: `src/store/settingsSlice.js` (`applyImport`)
- Test: `src/lib/workbookRoundTrip.test.js`, `src/lib/dataFormat.test.js`, `src/lib/logic.test.js`

**Interfaces:**
- Consumes: `normWeek` with `extra` (Task 1); store `experiments`, `saveExperiments`, snapshot `experiments` (Task 2).
- Produces: `normExperiments(list)` → valid, de-duplicated entries; data files and full workbooks carry `experiments`; weeks carry `extra` through JSON, Excel, merge and the fingerprint; import replace/merge handle the list.

- [ ] **Step 1: Write the failing tests**

`src/lib/logic.test.js` (add `normExperiments` to the import):

```js
describe('normExperiments', () => {
  it('keeps valid entries once each and drops malformed ones', () => {
    const e = { id: 'E1', ex: 'hack', ph: 'hyp', note: 'n' };
    expect(normExperiments([e, { ...e }, { id: '', ex: 'hack' }, { id: 'E2', ex: '' }, { id: 'E3', ex: 'hack', ph: 'zzz' }, null, 'x', { id: 'E4', ex: 'legext' }]))
      .toEqual([e, { id: 'E4', ex: 'legext', ph: null, note: '' }]);
    expect(normExperiments(undefined)).toEqual([]);
  });
});
```

`src/lib/workbookRoundTrip.test.js` (its `S` has no `experiments`; build one locally):

```js
  const exps = [{ id: 'E1', ex: 'hack', ph: 'hyp', note: 'try light' }, { id: 'E2', ex: 'legext', ph: null, note: '' }];
  const weeksX = () => ({ ...raw.weeks, '2030-01-06': { done: { 'X-1': true }, extra: [{ id: 'X-1', day: 2, ex: 'hack', ph: 'hyp', note: '' }] } });

  it('keeps the experiment list and added cards through the JSON file and the workbook (and a re-save)', async () => {
    const SX = { ...S, experiments: exps };
    const viaJson = parseDataFile(JSON.stringify(buildDataFile(SX, weeksX())));
    const wb = buildOverallWorkbook(X, SX, weeksX());
    const viaXlsx = await parseExcelExport(bytes(wb), DEFAULT_CFG);
    const viaResave = await parseExcelExport(bytes(X.read(bytes(wb), { type: 'array' })), DEFAULT_CFG);
    for (const d of [viaJson, viaXlsx, viaResave]) {
      expect(d.experiments).toEqual(exps);
      expect(d.weeks['2030-01-06'].extra).toEqual([{ id: 'X-1', day: 2, ex: 'hack', ph: 'hyp', note: '' }]);
    }
  });

  it('a workbook made before the Experiments sheet still imports as a full backup', async () => {
    const wb = buildOverallWorkbook(X, { ...S, experiments: exps }, raw.weeks);
    delete wb.Sheets.Experiments; wb.SheetNames = wb.SheetNames.filter(n => n !== 'Experiments');
    const d = await parseExcelExport(bytes(wb), DEFAULT_CFG);
    expect(d.excel.complete).toBe(true);
    expect(d.experiments).toEqual([]);
  });

  it('a JSON file without experiments imports with an empty list', () => {
    const f = buildDataFile(S, raw.weeks); delete f.experiments;
    expect(parseDataFile(JSON.stringify(f)).experiments).toEqual([]);
  });
```

Also add `'experiments'` to the list of keys compared in the existing "imports back everything the JSON data file holds" test (`for (const k of ['config', 'programs', 'library', 'weeks', 'body', 'experiments'])`).

`src/lib/dataFormat.test.js` (`mergeWeek` and `weekFingerprint` are already imported; read the file's existing fingerprint test for its `S` setup):

```js
it('mergeWeek unions experiment cards by id, this device first', () => {
  const a = { id: 'X-1', day: 2, ex: 'hack', ph: null, note: 'mine' }, b = { id: 'X-1', day: 3, ex: 'hack', ph: null, note: 'theirs' }, c = { id: 'X-2', day: 4, ex: 'legext', ph: null, note: '' };
  expect(mergeWeek({ extra: [a] }, { extra: [b, c] }).extra).toEqual([a, c]);
  expect(mergeWeek({}, { extra: [c] }).extra).toEqual([c]);
  expect(mergeWeek({}, {})).not.toHaveProperty('extra');
});
```

and, next to the existing fingerprint test, one asserting the fingerprint changes when a week gains an `extra` card (same pattern as the rest-date fingerprint test).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/logic.test.js src/lib/workbookRoundTrip.test.js src/lib/dataFormat.test.js`
Expected: FAIL (`normExperiments` missing; `experiments` and `extra` are dropped).

- [ ] **Step 3: Implement**

`src/lib/logic.js` (next to `isExtra`):

```js
// The Experiment list from a file or another device: valid entries, each id once.
export function normExperiments(list) {
  const seen = new Set();
  return (Array.isArray(list) ? list : []).filter(e => e && typeof e.id === 'string' && e.id !== '' && e.id.length <= 200 && typeof e.ex === 'string' && e.ex !== '' && (e.ph == null || PH_KEYS.includes(e.ph)) && (e.note == null || typeof e.note === 'string') && !seen.has(e.id) && seen.add(e.id))
    .map(e => ({ id: e.id, ex: e.ex, ph: e.ph ?? null, note: e.note || '' }));
}
```

`src/lib/export.js` (import `normExperiments`):
- `checkRows`: after the `order` row line add `(w.extra || []).forEach(x => rows.push([k, 'extra', x.id, JSON.stringify(x)]));`
- `addDataSheets`: destructure `experiments` from `S` (default `[]`) and append, after `Saved versions`: `X.utils.book_append_sheet(wb, sheet(X, [['Id', 'Exercise id', 'Exercise', 'Phase', 'Note'], ...(experiments || []).map(e => [e.id, e.ex, exInfo(cfg, e.ex).n, e.ph ?? '', e.note ?? ''])], [14, 16, 30, 11, 40]), 'Experiments');`
- `buildDataFile`: add `|| w.extra` to the week inclusion condition and `experiments: normExperiments(S.experiments)` to the returned object.
- `normalizeData`: add `experiments: normExperiments(d.experiments)` to `out`.
- `mergeWeek`: after the `restOn` line add `const have = new Set((w.extra || []).map(x => x.id)); const more = (o.extra || []).filter(x => !have.has(x.id)); if (more.length) w.extra = [...(w.extra || []), ...more];`
- `weekFingerprint`: add `nw.extra` to the hashed array.

`src/lib/excelImport.js`:
- `readWeeks`: add `else if (kind === 'extra') { try { (w.extra = w.extra || []).push(JSON.parse(str(v))); } catch { /* skip an unreadable card */ } }`
- `readDataSheets`: read `const exps = rows('Experiments');` (do NOT add it to the "all sheets present" check) and return `experiments: exps ? exps.slice(1).filter(r => r[0] !== '' && r[0] != null).map(([id, ex, , ph, note]) => ({ id: str(id), ex: str(ex), ph: str(ph) || null, note: str(note) })) : []` alongside the other fields.
- The non-full return (`return { exportedAt, config, programs: {}, library: [], …}`) gains `experiments: []`.

`src/store/settingsSlice.js` `applyImport`:
- replace branch: after `set({ library: …, body: … })` line add `set({ experiments: structuredClone(d.experiments || []) }); get().saveExperiments();`
- merge branch: after the library merge add
  ```js
  const exps = get().experiments; const haveE = new Set(exps.map(e => e.id)); const addE = (d.experiments || []).filter(e => !haveE.has(e.id));
  if (addE.length) get().setExperiments([...exps, ...structuredClone(addE)]);
  ```

- [ ] **Step 4: Run the whole suite and lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/logic.js src/lib/export.js src/lib/excelImport.js src/store/settingsSlice.js src/lib/logic.test.js src/lib/workbookRoundTrip.test.js src/lib/dataFormat.test.js
git commit -m "Back up, restore, merge and import the Experiment list and added cards"
```

---

### Task 5: The Experiments panel, the add sheet, Remove on cards, docs

**Files:**
- Create: `src/components/board/Experiments.jsx`
- Create: `src/components/sheets/ExperimentSheet.jsx`
- Modify: `src/components/board/Board.jsx` (cards from `weekSlots`; render the panel; drop an entry on a day)
- Modify: `src/components/board/Card.jsx` (Experiment tag; Remove button)
- Modify: `src/App.jsx` (modal case)
- Modify: `src/styles.css`, `src/components/sheets/HelpSheet.jsx`, `README.md`, `TODO.md`

**Interfaces:**
- Consumes: store `experiments`, `saveExperiment`, `deleteExperiment`, `addToDay`, `removeExtra`, `openModal`; slots with `experiment: true` (Tasks 1-2).
- Produces: the UI only.

There is no component test setup, so this task is verified by lint, tests, build and a manual run (Step 7). Read each file's current code before editing.

- [ ] **Step 1: The add/edit sheet**

Create `src/components/sheets/ExperimentSheet.jsx`, modelled on `ItemFields` in `SlotSheet.jsx` (same field markup and classes):

```jsx
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, PH_KEYS, exInfo, allExIds } from '../../lib/data.js';
import Sheet from '../Sheet.jsx';

// Add or edit an entry on the Experiment board: one exercise, a phase and a note.
export default function ExperimentSheet({ id }) {
  const cfg = useAppStore(s => s.cfg);
  const st = useAppStore.getState();
  const cur = id ? st.experiments.find(x => x.id === id) : null;
  const [d, setD] = useState(() => ({ id: cur ? cur.id : undefined, ex: cur ? cur.ex : '', nn: '', nu: '', ph: cur ? cur.ph : 'strength', note: cur ? cur.note : '' }));
  const [err, setErr] = useState('');
  const exIds = allExIds(cfg).sort((a, b) => exInfo(cfg, a).n.localeCompare(exInfo(cfg, b).n));
  const up = patch => setD(x => ({ ...x, ...patch }));
  const submit = e => { e.preventDefault(); const msg = st.saveExperiment({ ...d, nn: d.nn.trim(), nu: d.nu.trim(), note: d.note.trim() }); if (msg) setErr(msg); };
  return (
    <Sheet as="form" noValidate onSubmit={submit}>
      <h2 className="cond">{cur ? 'Edit experiment' : 'Add an exercise to try'}</h2>
      <label className="field">Exercise
        <select value={d.ex} onChange={e => up({ ex: e.target.value })}>
          {d.ex === '' && <option value="">Choose…</option>}
          {exIds.map(x => <option key={x} value={x}>{exInfo(cfg, x).n}</option>)}
          <option value="__new">+ New exercise…</option>
        </select>
      </label>
      {d.ex === '__new' && (
        <div className="fields">
          <label className="field">Name<input value={d.nn} placeholder="e.g. Cable Lateral Raise" onChange={e => up({ nn: e.target.value })} /></label>
          <label className="field">Video link (optional)<input type="url" value={d.nu} placeholder="https://" onChange={e => up({ nu: e.target.value })} /></label>
        </div>
      )}
      <label className="field">Phase
        <select value={d.ph || ''} onChange={e => up({ ph: e.target.value || null })}>
          <option value="">None</option>
          {PH_KEYS.map(p => <option key={p} value={p}>{PHASES[p].label}</option>)}
        </select>
      </label>
      <label className="field">Note<input value={d.note} placeholder="e.g. Saw it on YouTube, try light" onChange={e => up({ note: e.target.value })} /></label>
      {err && <p className="note err" role="alert">{err}</p>}
      <div className="actions">
        <button type="button" className="btn" onClick={st.closeModal}>Cancel</button>
        <button type="submit" className="btn primary">Save</button>
      </div>
    </Sheet>
  );
}
```

In `src/App.jsx` import it and add to the `Modal` switch: `case 'experiment': return <ExperimentSheet key={modal.id || 'new'} id={modal.id} />;`

- [ ] **Step 2: The panel**

Create `src/components/board/Experiments.jsx`:

```jsx
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { PHASES, exInfo } from '../../lib/data.js';
import { DAYS, lastLog, describe, todayCol } from '../../lib/logic.js';
import { ymd, monday } from '../../lib/dates.js';
import ArmedButton from '../ArmedButton.jsx';

// The Experiment board: exercises to try, added to a day of the viewed week. `day` is the column shown on phones.
export default function Experiments({ day, onDragStart, onDragEnd }) {
  const cfg = useAppStore(s => s.cfg);
  const items = useAppStore(s => s.experiments);
  const logs = useAppStore(s => s.logs);
  const rest = useAppStore(s => s.week.rest);
  const weekStart = useAppStore(s => s.weekStart);
  const today = useToday(s => s.today);
  const st = useAppStore.getState();
  const [pick, setPick] = useState({});
  const days = DAYS.filter(d => d !== rest);
  const start = ymd(monday(today)) === ymd(weekStart) ? todayCol(today) : day;
  const def = days.includes(start) ? start : days[0];
  return (
    <section className="experiments" aria-labelledby="exp-h">
      <div className="exphead">
        <h2 id="exp-h" className="cond">Experiments</h2>
        <button type="button" className="btn sm" onClick={() => st.openModal({ type: 'experiment' })}>+ Add exercise</button>
      </div>
      {!items.length ? <p className="note">Keep exercises you want to try here, then add them to a day.</p> : (
        <ul className="explist">
          {items.map(e => {
            const n = exInfo(cfg, e.ex).n; const last = lastLog(logs, e.ex); const to = days.includes(pick[e.id]) ? pick[e.id] : def;
            return (
              <li key={e.id} className="expcard" draggable="true" onDragStart={ev => onDragStart(ev, 'exp:' + e.id)} onDragEnd={onDragEnd}>
                <div><b>{n}</b>{e.ph && <> <span className="tag">{PHASES[e.ph].label}</span></>}</div>
                {e.note && <div className="note">{e.note}</div>}
                {last && <div className="lastlog">Last: {describe(last)}</div>}
                <div className="actions">
                  <label htmlFor={`exp-to-${e.id}`}>Add to</label>
                  <select id={`exp-to-${e.id}`} value={to} onChange={ev => setPick(p => ({ ...p, [e.id]: Number(ev.target.value) }))}>
                    {days.map(d => <option key={d} value={d}>Day {d}</option>)}
                  </select>
                  <button type="button" className="btn sm" aria-label={`Add ${n} to Day ${to}`} onClick={() => st.addToDay(e.id, to)}>Add</button>
                  <button type="button" className="btn sm ghost" aria-label={`Edit ${n}`} onClick={() => st.openModal({ type: 'experiment', id: e.id })}>Edit</button>
                  <ArmedButton className="btn sm ghost" label="Delete" armedLabel="Confirm delete" aria-label={n} onConfirm={() => st.deleteExperiment(e.id)} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
```

Before keeping the `ArmedButton` line, grep how `ArmedButton` is used elsewhere (`grep -rn ArmedButton src/components`) and match that usage's `aria-label`/`label` convention exactly, so the accessible name starts with the visible text in both the idle and armed state. Adjust the line accordingly.

- [ ] **Step 3: Board**

In `src/components/board/Board.jsx`:
- Import `Experiments from './Experiments.jsx'` and `weekSlots` from `../../lib/logic.js`.
- Replace `const slots = slotsFor(prog);` with `const slots = weekSlots(prog, week);` so the columns, tabs and counts include added cards (drop `slotsFor` from the data.js import if it becomes unused).
- Render `<Experiments day={day} onDragStart={onDragStart} onDragEnd={onDragEnd} />` right after the closing `</div>` of `<div className="board">`.
- In the normal column's `onDrop`, replace `st.moveSlot(id, d);` with `if (id.startsWith('exp:')) st.addToDay(id.slice(4), d); else st.moveSlot(id, d);`.

- [ ] **Step 4: Card**

In `src/components/board/Card.jsx`:
- Add `removeExtra` to the `useAppStore.getState()` destructuring.
- Change the tag line to include "Experiment": `{(label || s.tier || s.experiment) && <span className="tag">{[s.experiment && 'Experiment', s.tier, label].filter(Boolean).join(' · ')}</span>}`.
- After the Skip button add: `{s.experiment && <button type="button" className="btn sm ghost" id={`rm-${s.id}`} aria-label={`Remove ${cardName} from this week`} onClick={() => removeExtra(s.id)}>Remove</button>}`

- [ ] **Step 5: Styles**

Append to `src/styles.css` (desktop rules; the panel sits after the board in the mobile layout as well):

```css
.experiments{margin-top:16px;background:var(--sunk);border-radius:10px;padding:10px 12px}
.exphead{display:flex;align-items:center;justify-content:space-between;gap:8px}
.exphead h2{margin:0;font-size:21px;text-transform:uppercase}
.explist{list-style:none;margin:8px 0 0;padding:0 0 6px;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(240px,280px);gap:10px;overflow-x:auto}
.expcard{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:10px;display:flex;flex-direction:column;gap:6px}
.expcard .actions{justify-content:flex-start;align-items:center}
```

Check that `--sunk`, `--surface` and `--line` exist in the stylesheet (grep) and that buttons/selects inside reach 44 px through the existing rules.

- [ ] **Step 6: Docs and roadmap**

- `HelpSheet.jsx`: add a glossary row `['Experiments', 'A list under the board of exercises you want to try. Add one to a day of this week and it shows as a normal card for that week only; Remove takes it off again. The list itself stays for later weeks.']`
- `README.md`: add a feature bullet in the same style: `- **Experiments.** Keep exercises you want to try in a list under the board, and add one to any day of the week you're viewing. It's a normal card for that week only; your program doesn't change.`
- `TODO.md`: delete the line starting `- [ ] Add an Experiment board:` (the user removes finished items).

- [ ] **Step 7: Verify**

Run: `npm run lint && npm test && npm run build` — all must pass.

Then, if a headless browser is available, run these checks; otherwise report plainly that they were NOT run so the controller can hand them to the user. Start `npm run dev` and check at desktop width and at 360 to 400 px:
1. The "Experiments" panel sits under the day columns with its empty-state text; "+ Add exercise" opens the sheet; saving adds a card to the panel (also with "+ New exercise…").
2. "Add to Day N" + Add puts a card on that day under an "Experiment" heading with the "Experiment" tag; the panel entry stays. Dragging an entry onto a day column does the same on desktop. The rest day is not offered.
3. The added card checks off, logs, moves, skips and follows day swaps; Remove takes it off the week and unchecks it.
4. Edit and Delete (with the confirm press) work; deleting leaves cards already added.
5. Reload: the list and the added cards persist; next week has the list but not the cards.
6. Keyboard and screen reader: every control is reachable; names read "Add Cable Lateral Raise to Day 3", "Edit …", "Remove … from this week".

- [ ] **Step 8: Commit**

```bash
git add src/components src/App.jsx src/styles.css README.md TODO.md
git commit -m "Board: the Experiments panel, its add sheet, and Remove on experiment cards"
```
