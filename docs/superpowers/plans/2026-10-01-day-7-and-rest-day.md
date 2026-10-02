# Day 7 and Rest Day Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The board has 7 days, and a per-week "Rest day" checkbox inserts a rest day and shifts the later workouts one day later.

**Architecture:** `DAY_COUNT = 7` replaces every hardcoded 6. Programs saved with 6 days get an empty Day 7 appended wherever they enter the app (built-ins, saved programs, library, imports). The rest day is one number on the week (`week.rest`); the board layout is derived from it (`shownDay` / `programDay` in `logic.js`), so nothing stored is rewritten and unticking restores the original layout.

**Tech Stack:** React 19, zustand, vitest (Node, no DOM), SheetJS (`xlsx`), oxlint.

**Spec:** [docs/superpowers/specs/2026-10-01-day-7-and-rest-day-design.md](../specs/2026-10-01-day-7-and-rest-day-design.md)

## Global Constraints

- Branch: create a new branch from the current one (`excel-full-backup-and-csv`) and do the work there; one commit per task.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- `DAY_COUNT = 7`. Old programs and backups with exactly 6 days must still load and import; 5 or 8 days stay invalid.
- One rest day per week, stored as `week.rest = N` (integer 1 to 7). Absent when there is none; never written as `null`.
- Position labels renumber ("Day 4" is whatever sits fourth). A day's subtitle and make-up flag travel with its workout.
- Block the tick (with a message) when any card's effective program day is 7, because the shift would push it off the board. The message is exactly: `Day 7 has exercises, so there is no room to add a rest day. Move or clear them first.`
- A rest day counts as a complete day and contributes no exercises.
- WCAG 2.2 AAA: the checkbox has a visible text label equal to its accessible name ("Rest day"), a 44 px minimum target, and works by keyboard and touch. No drag-only interaction.
- Code style: match the surrounding code (dense, one-line helpers, comments only for non-obvious rules).
- Test commands: `npx vitest run <file>`; all tests `npm test`; lint `npm run lint`; build `npm run build`.

## Review Focus

1. A week saved with a rest day, then the program is edited so program day 7 gets exercises: the cards must still render (clamped into the last column), not vanish or throw. Test in Task 2.
2. Old backups and library versions with 6 days (JSON, Excel, saved library, saved programs) load and import with an empty Day 7. Tests in Task 1.
3. A workbook re-saved by Excel or Sheets (rest value comes back as text or number) still imports the rest day. Test in Task 4.
4. Warm-up ticks stay with the same workout when the rest day is toggled (warm-up is keyed by program day). Test in Task 5.
5. Moving a card onto the rest day is refused, and a move to a displayed day after the rest day lands on the right program day. Tests in Task 5.

---

### Task 1: Seven days and migration

**Files:**
- Modify: `src/lib/data.js` (constants, `resolveProgram`, built-in programs)
- Modify: `src/lib/export.js:174-175` (`normalizeData`)
- Modify: `src/store/useAppStore.js:475,496` (library load)
- Modify: `src/lib/dataFormat.test.js:42,52`
- Test: `src/lib/days.test.js` (create)

**Interfaces:**
- Produces (all from `src/lib/data.js`): `DAY_COUNT` (number, 7); `hasValidDays(p)` → boolean (true for `p.days.length` 6 or 7); `withAllDays(prog)` → a copy of `prog` with `days` padded to 7 by `{ title: 'Day N', slots: [] }`; `padLibrary(items)` → library items with each valid `prog` padded; `resolveProgram` now pads.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/days.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { DAY_COUNT, BUILTIN, hasValidDays, withAllDays, padLibrary, resolveProgram } from './data.js';

const six = () => ({ warm: 'w', days: Array.from({ length: 6 }, (_, i) => ({ title: `Day ${i + 1}`, slots: [] })) });

describe('seven days', () => {
  it('has seven days, and the built-in programs end with an empty Day 7', () => {
    expect(DAY_COUNT).toBe(7);
    ['A', 'B'].forEach(k => { expect(BUILTIN[k].days).toHaveLength(7); expect(BUILTIN[k].days[6]).toEqual({ title: 'Day 7', slots: [] }); });
  });
  it('accepts 6 or 7 days and nothing else', () => {
    expect(hasValidDays(six())).toBe(true);
    expect(hasValidDays(withAllDays(six()))).toBe(true);
    expect(hasValidDays({ days: six().days.slice(0, 5) })).toBe(false);
    expect(hasValidDays({ days: [...withAllDays(six()).days, { title: 'Day 8', slots: [] }] })).toBe(false);
    expect(hasValidDays(null)).toBe(false);
    expect(hasValidDays({})).toBe(false);
  });
  it('pads a 6-day program with an empty Day 7 without touching the original', () => {
    const p = six(); const q = withAllDays(p);
    expect(q.days).toHaveLength(7); expect(q.days[6]).toEqual({ title: 'Day 7', slots: [] }); expect(q.warm).toBe('w');
    expect(p.days).toHaveLength(6);
  });
  it('resolveProgram pads a saved 6-day program and falls back to the built-in for a bad one', () => {
    expect(resolveProgram('A', six()).days).toHaveLength(7);
    expect(resolveProgram('A', six()).key).toBe('A');
    expect(resolveProgram('A', { days: [] })).toBe(BUILTIN.A);
    expect(resolveProgram('B', null)).toBe(BUILTIN.B);
  });
  it('padLibrary pads each saved version and leaves a broken one alone', () => {
    const out = padLibrary([{ id: 'x', prog: six() }, { id: 'y', prog: { days: [] } }, null]);
    expect(out[0].prog.days).toHaveLength(7);
    expect(out[1].prog).toEqual({ days: [] });
    expect(out[2]).toBeNull();
  });
});
```

In `src/lib/dataFormat.test.js` change `expect(A.days).toHaveLength(6);` (line 42) to `toHaveLength(7)`, and in line 52 change both trailing `6` values in the expected array to `7`: `[['mk3x9a1b', 'A', false, 7], ['mk3xauto', 'B', true, 7]]`. Add this test inside the same `describe` as line 42, reusing its `parseDataFile` import and fixture variable names (read lines 30-60 first and follow them):

```js
it('pads a 6-day program from an old backup with an empty Day 7', () => {
  expect(A.days[6]).toEqual({ title: 'Day 7', slots: [] });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/days.test.js src/lib/dataFormat.test.js`
Expected: FAIL (`DAY_COUNT` / `withAllDays` are not exported; `dataFormat` length expectations fail).

- [ ] **Step 3: Implement**

In `src/lib/data.js`, add right after the `PH_KEYS` line:

```js
export const DAY_COUNT = 7;
// Programs saved before Day 7 existed have 6 days; they get an empty seventh.
export const hasValidDays = p => !!p && Array.isArray(p.days) && p.days.length >= 6 && p.days.length <= DAY_COUNT;
export function withAllDays(prog) {
  const days = prog.days.slice();
  while (days.length < DAY_COUNT) days.push({ title: `Day ${days.length + 1}`, slots: [] });
  return { ...prog, days };
}
export const padLibrary = items => items.map(it => (it && hasValidDays(it.prog) ? { ...it, prog: withAllDays(it.prog) } : it));
```

Replace the line `PROGRAM_A.key = 'A'; PROGRAM_B.key = 'B';` with:

```js
PROGRAM_A.key = 'A'; PROGRAM_B.key = 'B';
[PROGRAM_A, PROGRAM_B].forEach(p => { p.days = withAllDays(p).days; });
```

Replace `resolveProgram`:

```js
export function resolveProgram(k, data) { return hasValidDays(data) ? withAllDays({ ...structuredClone(data), key: k }) : BUILTIN[k]; }
```

In `src/lib/export.js`, change the import from `./data.js` to also bring in `hasValidDays, withAllDays` (read the file's import lines first), then replace lines 174-175:

```js
  ['A', 'B'].forEach(k => { const p = d.programs && d.programs[k]; if (hasValidDays(p)) out.programs[k] = withAllDays(p); });
  (Array.isArray(d.library) ? d.library : []).forEach(it => { if (it && it.id && hasValidDays(it.prog)) out.library.push({ ...it, prog: withAllDays(it.prog) }); });
```

In `src/store/useAppStore.js`, add `padLibrary` to the `../lib/data.js` import on line 2, then change line 475 to `library: padLibrary((LS.get('library/main') || {}).items || []),` and line 496 to `set(state => ({ library: s.exists ? padLibrary([...((s.data() || {}).items || [])]) : [], ...markReady('lib')(state) }));`.

- [ ] **Step 4: Run the whole suite**

Run: `npm test`
Expected: PASS. (The `trends.test.js` programs are 6-day fixtures that don't pass through `resolveProgram`, so they are unaffected until Task 3.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/data.js src/lib/export.js src/store/useAppStore.js src/lib/days.test.js src/lib/dataFormat.test.js
git commit -m "Programs have 7 days; 6-day programs and backups get an empty Day 7"
```

---

### Task 2: Rest-day layout helpers and `week.rest`

**Files:**
- Modify: `src/lib/logic.js` (import line 1, `currentLayout` at ~157, `normWeek` at ~228, new helpers)
- Test: `src/lib/logic.test.js`

**Interfaces:**
- Consumes: `DAY_COUNT` from `data.js`.
- Produces (from `logic.js`): `DAYS` (`[1..7]`); `shownDay(rest, d)` → displayed day for program day `d` (clamped to 7); `programDay(rest, d)` → program day shown at displayed day `d`, or `null` for the rest column; `dayTitle(dayDef, d)` → heading text; `restBlocked(week, slots)` → boolean; `currentLayout(week, slots)` → `{1..7: slots[]}` in displayed days; `normWeek` keeps `rest`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/logic.test.js` (add `DAYS, shownDay, programDay, dayTitle, restBlocked, currentLayout, normWeek` to its existing `./logic.js` import, adding only the names not already imported):

```js
describe('rest day layout', () => {
  const sl = (id, day) => ({ id, day, type: 'single', items: [{ ex: 'hack' }] });
  const slots = [sl('a', 1), sl('b', 3), sl('c', 6)];
  const ids = cols => Object.fromEntries(Object.entries(cols).map(([d, l]) => [d, l.map(s => s.id)]));

  it('maps program days to displayed days around the rest position', () => {
    expect(DAYS).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect([1, 2, 3, 4, 5, 6].map(d => shownDay(3, d))).toEqual([1, 2, 4, 5, 6, 7]);
    expect(DAYS.map(d => programDay(3, d))).toEqual([1, 2, null, 3, 4, 5, 6]);
    expect(shownDay(null, 4)).toBe(4);
    expect(programDay(undefined, 4)).toBe(4);
  });
  it('lays the week out with no rest day', () => {
    expect(ids(currentLayout({ moved: {} }, slots))).toEqual({ 1: ['a'], 2: [], 3: ['b'], 4: [], 5: [], 6: ['c'], 7: [] });
  });
  it('inserts an empty rest column and shifts later workouts one day', () => {
    expect(ids(currentLayout({ moved: {}, rest: 3 }, slots))).toEqual({ 1: ['a'], 2: [], 3: [], 4: ['b'], 5: [], 6: [], 7: ['c'] });
  });
  it('shifts moved cards too', () => {
    expect(ids(currentLayout({ moved: { a: 5 }, rest: 3 }, slots))[6]).toEqual(['a']);
  });
  it('clamps a card that would fall off the end into the last column instead of losing it', () => {
    const cols = currentLayout({ moved: {}, rest: 2 }, [...slots, sl('d', 7)]);
    expect(cols[7].map(s => s.id).sort()).toEqual(['c', 'd']);
  });
  it('blocks a rest day when a card sits on program day 7', () => {
    expect(restBlocked({ moved: {} }, slots)).toBe(false);
    expect(restBlocked({ moved: {} }, [...slots, sl('d', 7)])).toBe(true);
    expect(restBlocked({ moved: { c: 7 } }, slots)).toBe(true);
  });
  it('titles a day by its position, keeping custom titles', () => {
    expect(dayTitle({ title: 'Day 4' }, 5)).toBe('Day 5');
    expect(dayTitle({}, 2)).toBe('Day 2');
    expect(dayTitle({ title: 'Leg day' }, 2)).toBe('Leg day');
  });
  it('normWeek keeps a valid rest day and drops anything else', () => {
    expect(normWeek({ rest: 3 }).rest).toBe(3);
    expect(normWeek({ rest: '3' }).rest).toBe(3);
    ['x', 0, 8, null, undefined, 2.5].forEach(v => expect(normWeek({ rest: v })).not.toHaveProperty('rest'));
    expect(normWeek(null)).not.toHaveProperty('rest');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/logic.test.js`
Expected: FAIL (`shownDay is not a function` or similar).

- [ ] **Step 3: Implement**

In `src/lib/logic.js`, change line 1 to `import { PHASES, PH_KEYS, exInfo, DAY_COUNT } from './data.js';`.

Replace `currentLayout`:

```js
/* ---------- Days and the rest day ----------
   week.rest = N inserts a rest day at displayed position N: workouts on program days N and later
   show one day later. The layout is derived, so nothing stored changes and unticking undoes it. */
export const DAYS = Array.from({ length: DAY_COUNT }, (_, i) => i + 1);
export const shownDay = (rest, d) => (rest && d >= rest ? Math.min(d + 1, DAY_COUNT) : d);
export const programDay = (rest, d) => (!rest || d < rest ? d : d === rest ? null : d - 1);
export const dayTitle = (day, d) => (!day.title || /^Day \d+$/.test(day.title) ? `Day ${d}` : day.title);
// The shift would push a workout off the board when something is already on the last day.
export const restBlocked = (week, slots) => slots.some(s => ((week.moved && week.moved[s.id]) || s.day) === DAY_COUNT);
export function currentLayout(week, slots) {
  const cols = Object.fromEntries(DAYS.map(d => [d, []]));
  slots.forEach(s => cols[shownDay(week.rest, (week.moved && week.moved[s.id]) || s.day)].push(s));
  return cols;
}
```

Replace `normWeek`:

```js
export const normWeek = w => {
  const out = { prog: (w && w.prog) || null, done: { ...(w && w.done) }, skipped: { ...(w && w.skipped) }, moved: { ...(w && w.moved) }, ph: { ...(w && w.ph) }, warm: JSON.parse(JSON.stringify((w && w.warm) || {})) };
  const rest = Number(w && w.rest);
  if (Number.isInteger(rest) && rest >= 1 && rest <= DAY_COUNT) out.rest = rest;
  return out;
};
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/lib/logic.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/logic.js src/lib/logic.test.js
git commit -m "Rest day layout helpers: shownDay, programDay, restBlocked, week.rest"
```

---

### Task 3: Stats count 7 days and the rest day

**Files:**
- Modify: `src/lib/trends.js:2,16-24` (`weekSummary`)
- Modify: `src/lib/muscles.js:78` (live day)
- Modify: `src/components/progress/Progress.jsx:32,39,42`
- Modify: `src/components/progress/Trends.jsx:30`
- Modify: `src/lib/export.js:130` (week workbook summary text)
- Test: `src/lib/trends.test.js`

**Interfaces:**
- Consumes: `DAYS`, `currentLayout`, `shownDay` from `logic.js`; `DAY_COUNT` from `data.js`.
- Produces: `weekSummary(...).days` is now 7 entries (0 not started, 1 partly, 2 complete); the rest day is 2.

- [ ] **Step 1: Write the failing tests**

In `src/lib/trends.test.js`, change line 21 to `expect(r.days).toEqual([1, 0, 2, 0, 0, 0, 0]);` (keep the trailing comment) and line 35's array to `[0, 0, 0, 0, 0, 0, 0]`. Add inside the `describe('weekSummary…')` block:

```js
  it('counts the rest day as complete and shifts later workouts one day', () => {
    // Rest on day 2: a, b stay on day 1; c (planned day 2) shows on day 3; d (planned day 3) on day 4.
    const r = weekSummary(cfg(), programs, '2026-09-20', { done: { a: true, 'b#0': true, 'b#1': true, c: true }, skipped: {}, moved: {}, rest: 2 });
    expect(r.days).toEqual([2, 2, 2, 0, 0, 0, 0]);
    expect(r.full).toBe(3);
    expect(r).toMatchObject({ ex: 4, total: 5 }); // the rest day adds no exercises
  });
  it('reads 6 days with an empty, non-rest Day 7', () => {
    const all = { done: { a: true, 'b#0': true, 'b#1': true, c: true, d: true }, skipped: {}, moved: {} };
    expect(weekSummary(cfg(), programs, '2026-09-20', all).days).toEqual([2, 2, 2, 0, 0, 0, 0]);
  });
```

(`programs` days 4 to 6 are empty in that test fixture; the shared helper defines 6 days. `weekSummary` receives the program from `programs`, which are not run through `resolveProgram` in this file, so it must tolerate 6-day programs. The implementation below does, because layout is keyed by slots, not by `prog.days.length`.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/trends.test.js`
Expected: FAIL (arrays have 6 entries).

- [ ] **Step 3: Implement**

`src/lib/trends.js`: change line 3 to `import { programFor, tally, currentLayout, DAYS } from './logic.js';` and replace the two lines that build `cols` and `days` (lines 18-19) with:

```js
  const cols = currentLayout({ ...w, moved: w.moved || {} }, slots);
  const days = DAYS.map(d => { if (d === w.rest) return 2; const t = tally(cols[d], w); return t.full ? 2 : t.done > 0 ? 1 : 0; });
```

`src/lib/muscles.js`: add `shownDay` to its `./logic.js` import (read the file's import line) and change line 78 to:

```js
    const day = live ? shownDay(week.rest, week.moved[sl.id] || sl.day) : sl.day;
```

`src/components/progress/Progress.jsx`: add `import { DAY_COUNT } from '../../lib/data.js';` (merge with an existing data.js import if there is one), then replace `of 6 days completed` with `of {DAY_COUNT} days completed` (JSX expression: `Average {mean} of {DAY_COUNT} days completed over …`), `${r.full} of 6 days complete:` with `${r.full} of ${DAY_COUNT} days complete:`, and `/6 days ·` with `/{DAY_COUNT} days ·`.

`src/components/progress/Trends.jsx`: add the same `DAY_COUNT` import and change `· ${r.full} of 6 days` to `· ${r.full} of ${DAY_COUNT} days`.

`src/lib/export.js` line 130: `${r.full} of 6` becomes `${r.full} of ${DAY_COUNT}` (add `DAY_COUNT` to the `./data.js` import).

- [ ] **Step 4: Run the whole suite and lint**

Run: `npm test && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/trends.js src/lib/muscles.js src/components/progress/Progress.jsx src/components/progress/Trends.jsx src/lib/export.js src/lib/trends.test.js
git commit -m "Stats count seven days; the rest day counts as complete"
```

---

### Task 4: Save and restore `week.rest` (JSON, Excel, backups)

**Files:**
- Modify: `src/lib/export.js` (`checkRows` ~106, `weekFingerprint` ~200, `buildDataFile` ~154, `mergeWeek` ~184, week workbook Plan sheet ~136)
- Modify: `src/lib/excelImport.js:155-163` (`readWeeks`)
- Test: `src/lib/workbookRoundTrip.test.js`

**Interfaces:**
- Consumes: `normWeek` keeping `rest` (Task 2), `shownDay` from `logic.js`.
- Produces: a `rest` row kind in the `Check-offs` sheet (`[week, 'rest', '', N]`); `week.rest` survives JSON and Excel round trips; `mergeWeek` keeps a rest day from either side.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/workbookRoundTrip.test.js` inside its `describe`:

```js
  it('keeps a week’s rest day through the JSON file and the workbook', async () => {
    const weeks = { ...raw.weeks, '2030-01-06': { done: {}, rest: 3 } };
    const viaJson = parseDataFile(JSON.stringify(buildDataFile(S, weeks)));
    const viaXlsx = await parseExcelExport(bytes(buildOverallWorkbook(X, S, weeks)), DEFAULT_CFG);
    expect(viaJson.weeks['2030-01-06'].rest).toBe(3);
    expect(viaXlsx.weeks['2030-01-06'].rest).toBe(3);
  });

  it('keeps the rest day once Excel or Sheets has re-saved the workbook', async () => {
    const weeks = { ...raw.weeks, '2030-01-06': { done: {}, rest: 3 } };
    const wb = X.read(bytes(buildOverallWorkbook(X, S, weeks)), { type: 'array' });
    const viaXlsx = await parseExcelExport(bytes(wb), DEFAULT_CFG);
    expect(viaXlsx.weeks['2030-01-06'].rest).toBe(3);
  });
```

Add to `src/lib/dataFormat.test.js` (use its existing imports; add `mergeWeek` to the `./export.js` import if missing):

```js
it('mergeWeek keeps a rest day from either side, preferring this device', () => {
  expect(mergeWeek({ rest: 2 }, { rest: 5 }).rest).toBe(2);
  expect(mergeWeek({}, { rest: 5 }).rest).toBe(5);
  expect(mergeWeek({}, {})).not.toHaveProperty('rest');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/workbookRoundTrip.test.js src/lib/dataFormat.test.js`
Expected: FAIL (`rest` is undefined after the round trip; `mergeWeek` drops it).

- [ ] **Step 3: Implement**

`src/lib/export.js`:
- `checkRows`, after the `prog` row line: `if (w.rest) rows.push([k, 'rest', '', w.rest]);`
- `buildDataFile`: change the inclusion condition to `if (w.prog || w.rest || [w.done, w.skipped, w.moved, w.ph, w.warm].some(o => Object.keys(o).length)) W[k] = w;`
- `mergeWeek`: after `w.prog = w.prog || o.prog;` add `if (!w.rest && o.rest) w.rest = o.rest;`
- `weekFingerprint`: add `w.rest` to the hashed array: `[w.done, w.skipped, w.moved, w.ph, w.prog, w.rest, L, programs[...]]` (a rest change must trigger a backup).
- Week workbook Plan sheet: import `shownDay` from `./logic.js` and change the "Done on day" value from `moved || s.day` to `shownDay(w.rest, moved || s.day)`. The "Planned day" column stays `s.day`.

`src/lib/excelImport.js` in `readWeeks`, add after the `prog` branch:

```js
    else if (kind === 'rest') { const n = num(v); if (n >= 1) w.rest = n; }
```

(`num` returns a number for numeric text such as `'3'`, which is what an Excel re-save produces; `normWeek` in `normalizeData` then validates the range.)

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/export.js src/lib/excelImport.js src/lib/workbookRoundTrip.test.js src/lib/dataFormat.test.js
git commit -m "Back up and restore each week's rest day in JSON and Excel"
```

---

### Task 5: Store actions: set rest day, moves, warm-ups

**Files:**
- Modify: `src/store/useAppStore.js` (imports, `setWarm` ~199, `moveSlot` ~207, `undoMove` ~218, new `setRestDay`)
- Modify: `src/components/board/Board.jsx:130` (`moveNote.from` text)
- Test: `src/store/useAppStore.test.js`

**Interfaces:**
- Consumes: `programDay`, `shownDay`, `restBlocked`, `currentLayout` from `logic.js`.
- Produces: `setRestDay(n)` → boolean (toggles `week.rest`; refuses with the Global Constraints message when blocked); `moveSlot(slotId, shownDayNumber)` maps to a program day and refuses the rest day; `setWarm(shownDayNumber, wid, on)` stores under the program day; `moveNote` gains `fromShown`.

- [ ] **Step 1: Write the failing tests**

In `src/store/useAppStore.test.js`, add `currentLayout` to the dynamic imports (`let ... currentLayout;` and `({ DEFAULT_CFG, currentLayout } = await import('../lib/logic.js'));`) and append:

```js
// Program A: A-d1s1 is on Day 1, A-d3s1 (Hack Squat) on Day 3; Day 7 is empty.
describe('rest day', () => {
  const ids = d => currentLayout(st().week, st().activeSlots())[d].map(s => s.id);

  it('shifts later workouts one day, saves the week, and clears on a second tick', () => {
    expect(st().setRestDay(3)).toBe(true);
    expect(st().week.rest).toBe(3);
    expect(saved('weeks/' + st().weekKey()).rest).toBe(3);
    expect(ids(3)).toEqual([]);
    expect(ids(4)).toContain('A-d3s1');
    expect(st().setRestDay(3)).toBe(true);
    expect(st().week.rest).toBeUndefined();
    expect(ids(3)).toContain('A-d3s1');
  });
  it('moves the rest day when another day is ticked', () => {
    st().setRestDay(3); st().setRestDay(2);
    expect(st().week.rest).toBe(2);
  });
  it('is blocked, with a message, when Day 7 has exercises', () => {
    st().mutateWeek(w => { w.moved['A-d3s1'] = 7; });
    expect(st().setRestDay(2)).toBe(false);
    expect(st().week.rest).toBeUndefined();
  });
  it('moves a card to the program day behind a displayed day', () => {
    st().setRestDay(3);
    st().moveSlot('A-d1s1', 5); // displayed Day 5 is program Day 4
    expect(st().week.moved['A-d1s1']).toBe(4);
    expect(ids(5)).toContain('A-d1s1');
    st().undoMove();
    expect(st().week.moved['A-d1s1']).toBeUndefined();
  });
  it('refuses to move a card onto the rest day', () => {
    st().setRestDay(3);
    st().moveSlot('A-d1s1', 3);
    expect(st().week.moved['A-d1s1']).toBeUndefined();
  });
  it('keeps a warm-up tick with its workout when the rest day is toggled', () => {
    st().setRestDay(3);
    st().setWarm(4, 'shadow', true); // displayed Day 4 is program Day 3
    expect(st().week.warm[3]).toEqual({ shadow: true });
    st().setRestDay(3);
    expect(st().week.warm[3].shadow).toBe(true);
  });
  it('checks off a displayed day', () => {
    st().setRestDay(3);
    st().checkDay(4, true); // displayed Day 4 holds program Day 3
    expect(st().week.done['A-d3s1']).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/store/useAppStore.test.js`
Expected: FAIL (`st().setRestDay is not a function`).

- [ ] **Step 3: Implement**

In `src/store/useAppStore.js`, add `programDay, shownDay, restBlocked` to the `../lib/logic.js` import (read its existing import list at lines 4-8; `currentLayout` is already imported).

Replace `setWarm`:

```js
  setWarm(day, wid, on) {
    const pd = programDay(get().week.rest, day); if (pd == null) return;
    get().mutateWeek(w => { w.warm[pd] = w.warm[pd] || {}; w.warm[pd][wid] = on; });
  },
  // Tick or untick the rest day. One per week; ticking another day moves it.
  setRestDay(n) {
    const w = get().week;
    if (w.rest !== n && restBlocked(w, get().activeSlots())) { flag('Day 7 has exercises, so there is no room to add a rest day. Move or clear them first.'); return false; }
    set({ moveNote: null });
    return get().mutateWeek(x => { if (x.rest === n) delete x.rest; else x.rest = n; });
  },
```

Replace `moveSlot` and `undoMove`:

```js
  moveSlot(slotId, day) {
    const s = get().slotById(slotId); if (!s) return;
    const rest = get().week.rest;
    const pd = programDay(rest, day); // `day` is the displayed day; cards are stored by program day
    if (pd == null) { flag('That is your rest day'); return; }
    const from = get().week.moved[slotId] || s.day;
    const ok = get().mutateWeek(w => { if (pd === s.day) delete w.moved[slotId]; else w.moved[slotId] = pd; });
    if (!ok) return;
    const { cfg, week } = get();
    const clashes = moveClashes(cfg, week, get().activeSlots(), s, day);
    set({ moveNote: clashes.length ? { slot: slotId, from, fromShown: shownDay(rest, from), to: day, week: get().weekKey(), lines: clashes } : null });
    flag(clashes.length ? `Moved to Day ${day} · heads-up` : `Moved to Day ${day}`);
  },
  undoMove() {
    const n = get().moveNote; if (!n || n.week !== get().weekKey()) return;
    const s = get().slotById(n.slot); set({ moveNote: null });
    if (s && get().mutateWeek(w => { if (n.from === s.day) delete w.moved[n.slot]; else w.moved[n.slot] = n.from; })) flag(`Moved back to Day ${n.fromShown}`);
  },
```

(`moveClashes` already reads `currentLayout`, which is in displayed days, so `day` is passed displayed.)

In `src/components/board/Board.jsx` line 130 change `Move back to Day {moveNote.from}` to `Move back to Day {moveNote.fromShown}`.

Also in `useAppStore.test.js` `beforeEach`, no change is needed (the week object has no `rest`, which means none).

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: PASS. (`undoMove` in the "program day behind a displayed day" test has no clash, so `moveNote` is null and `undoMove` does nothing; if that assertion fails for that reason, call `st().moveSlot('A-d1s1', 1)` instead of `undoMove()`, which moves it back to its planned day.)

- [ ] **Step 5: Commit**

```bash
git add src/store/useAppStore.js src/components/board/Board.jsx src/store/useAppStore.test.js
git commit -m "Store: set a rest day; moves and warm-ups follow the shifted days"
```

---

### Task 6: Board, cards, editor and docs

**Files:**
- Modify: `src/components/board/Board.jsx`
- Modify: `src/components/board/Card.jsx:21,88`
- Modify: `src/components/sheets/SlotSheet.jsx:86`
- Modify: `src/components/program/Editor.jsx:114`
- Modify: `src/styles.css` (add `.restchk`)
- Modify: `src/components/sheets/HelpSheet.jsx:24,36` and `README.md:28`

**Interfaces:**
- Consumes: `DAYS`, `shownDay`, `programDay`, `dayTitle` from `logic.js`; `setRestDay`, `setWarm`, `moveSlot` from the store (Task 5).
- Produces: the UI. No new exports.

There is no component test setup, so each step here is verified by running the app (Step 5).

- [ ] **Step 1: Board logic**

`src/components/board/Board.jsx`:

Change the logic import to `import { tally, currentLayout, isOpen, isSkipped, programFor, progName, DAYS, programDay, dayTitle } from '../../lib/logic.js';`.

Immediately after `const cols = currentLayout(week, slots);` add `const rest = week.rest || null;`.

Replace the default-day line (`if (day == null) { day = 1; for (let d = 1; d <= 6; d++) …`) with:

```js
  if (day == null) { day = 1; for (const d of DAYS) { if (d !== rest && cols[d].some(s => isOpen(s, week))) { day = d; break; } } }
```

Swipe (line ~69): replace `Math.min(6, Math.max(1, day + (dx < 0 ? 1 : -1)))` with `Math.min(DAYS.length, Math.max(1, day + (dx < 0 ? 1 : -1)))`.

Keyboard handler on the tab list: replace `End: 6` with `End: DAYS.length` and `const d = ((n - 1 + 6) % 6) + 1;` with `const d = ((n - 1 + DAYS.length) % DAYS.length) + 1;`.

- [ ] **Step 2: Day tabs**

Replace the `{[1, 2, 3, 4, 5, 6].map(d => { const t = tally(cols[d], week); return ( <button …` tab block with:

```jsx
        {DAYS.map(d => {
          const t = tally(cols[d], week); const isRest = d === rest;
          const short = isRest ? 'Rest' : t.full ? '✓' : `${t.done}/${t.total}`;
          return (
            <button type="button" role="tab" key={d} id={`daytab-${d}`} aria-selected={d === day} aria-controls={`col-${d}`} tabIndex={d === day ? 0 : -1}
              // The name starts with the visible text ("D1 0/11") so voice control users can say what they see (WCAG 2.5.3).
              className={isRest || t.full ? 'full' : ''} aria-label={`D${d} ${short}: Day ${d}, ${isRest ? 'rest day' : t.full ? 'all done' : `${t.done} of ${t.total} done`}`}
              onClick={() => { st.setMDay(d); window.scrollTo({ top: 0, behavior: motionOK() ? 'auto' : 'instant' }); }}>
              <b aria-hidden="true">D{d}</b>{' '}<span aria-hidden="true">{short}</span>
            </button>
          );
        })}
```

- [ ] **Step 3: Columns**

Replace `{[1, 2, 3, 4, 5, 6].map(d => {` / `const dayDef = prog.days[d - 1];` at the start of the board columns with:

```jsx
        {DAYS.map(d => {
          const pd = programDay(rest, d); // the program day shown here; null for the rest day
          if (pd == null) return (
            <section key={d} id={`col-${d}`} aria-labelledby={`colh-${d}`} className={`col rest complete${d === day ? ' sel' : ''}`}>
              <div className="colhead"><div><h3 id={`colh-${d}`}>Day {d}</h3><div className="sub">Rest day</div></div></div>
              <label className="restchk"><input type="checkbox" className="chk" id={`rest-${d}`} checked onChange={() => st.setRestDay(d)} /> Rest day</label>
              <p className="note">Your workouts moved one day later. Untick to put them back.</p>
            </section>
          );
          const dayDef = prog.days[pd - 1];
```

Inside the same column code, make these replacements:
- `const warm = week.warm[d] || {};` → `const warm = week.warm[pd] || {};`
- In the `pending` line, leave `s.day < 5 …` as is (program-day logic).
- `const sec = secOf(s, d);` and `sec !== secOf(open[i - 1], d)` → use `pd` instead of `d` in both calls (`secOf(s, pd)`, `secOf(open[i - 1], pd)`).
- Heading: `<h3 id={`colh-${d}`}>{dayDef.title}</h3>` → `<h3 id={`colh-${d}`}>{dayTitle(dayDef, d)}</h3>`.
- Add the checkbox directly after the closing `</div>` of `.colhead` and before `<div className="warm">`:

```jsx
              <label className="restchk"><input type="checkbox" className="chk" id={`rest-${d}`} checked={false} onChange={() => st.setRestDay(d)} /> Rest day</label>
```

(The `onDragOver` / `onDrop` handlers keep using the displayed `d`; `moveSlot` maps it.)

- [ ] **Step 4: Menus, styles and docs**

`src/components/board/Card.jsx`: add `DAYS, shownDay` to the `../../lib/logic.js` import; change `const cur = week.moved[s.id] || s.day;` to `const cur = shownDay(week.rest, week.moved[s.id] || s.day);` and replace the options line with:

```jsx
          {DAYS.map(d => <option key={d} value={d} disabled={d === week.rest}>Day {d}{d === week.rest ? ' (rest)' : d === shownDay(week.rest, s.day) ? ' (planned)' : ''}</option>)}
```

`src/components/sheets/SlotSheet.jsx` and `src/components/program/Editor.jsx`: add `DAYS` to a `../../lib/logic.js` import (create the import if the file has none) and replace `[1, 2, 3, 4, 5, 6].map(` with `DAYS.map(` (one occurrence each; these are program days, which is correct).

`src/styles.css`: add after the `.colhead .count` line (line 245):

```css
.restchk{display:flex;align-items:center;gap:8px;min-height:44px;font-size:13px;color:var(--muted)}
```

`src/components/sheets/HelpSheet.jsx`: change the glossary row `['D1 to D6', 'Day 1 to Day 6 of the week’s plan.']` to `['D1 to D7', 'Day 1 to Day 7 of the week’s plan.'], ['Rest day', 'Tick Rest day on a day to rest. Your workouts from that day on move one day later, and the rest day counts as done. Untick to undo. You can’t add one while Day 7 has exercises.']`, and in the Board step change `(D1 to D6)` to `(D1 to D7)`.

`README.md` line 28: change the image alt text `six training days` to `seven days (six training days and a rest day)`; and add one bullet to the features list near the board description (read lines 40-60 and match the neighboring bullets' style): `- **Rest day.** Tick Rest day on any day of the week and your workouts from that day on move one day later. Untick to put them back.`

- [ ] **Step 5: Verify in the running app**

Run: `npm run lint && npm test && npm run build` (all must pass), then start the dev server with `npm run dev` and check in a browser at desktop width and at 400 px width:
1. The board shows Day 1 to Day 7, Day 7 empty.
2. Tick Rest day on Day 3: Day 3 becomes a "Rest day" column, old Day 3 appears as Day 4, the last workout appears on Day 7, the tab reads "D3 Rest", and the week's stats read 7 of 7 once everything is done.
3. Untick: the original layout returns. Check-offs made while rested are still checked.
4. With an exercise on Day 7, ticking Rest day shows the exact message and changes nothing.
5. The card "Move to" menu lists Day 1 to 7, with the rest day disabled and labeled "(rest)".
6. Warm-up ticks and a moved card stay with their workout when toggling rest.
7. Reload the page: the rest day persists. Open the Program tab: Day 7 is selectable and accepts a new exercise.
8. Keyboard: Tab to the checkbox and press Space; arrow keys move between the 7 day tabs.

Report anything that does not match.

- [ ] **Step 6: Commit**

```bash
git add src/components src/styles.css README.md
git commit -m "Board: seven days and a Rest day checkbox"
```

---

### Task 7: Roadmap and final check

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Update the roadmap**

In `TODO.md` section 2, replace the two items "Add a Day 7 to the board…" and "Add a Rest lane…" (with its sub-bullet) with:

```markdown
- [x] Add a Day 7 to the board. It starts empty, and exercises can be added whenever.
- [x] Add a Rest day checkbox to each day. Ticking it inserts a rest day there and moves the later workouts one day later (blocked while Day 7 has exercises). A rest day counts as a complete day, and its exercises aren't in it, so volume numbers aren't inflated.
```

- [ ] **Step 2: Full verification**

Run: `npm test && npm run lint && npm run build`
Expected: all pass. Run `git status --short` and confirm only intended files are changed.

- [ ] **Step 3: Commit**

```bash
git add TODO.md
git commit -m "Tick Day 7 and the Rest day checkbox on the roadmap"
```
