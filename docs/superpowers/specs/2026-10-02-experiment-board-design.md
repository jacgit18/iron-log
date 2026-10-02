# Experiment board

Roadmap: TODO.md section 2, "Add an Experiment board".

## Goal

A standing list of exercises the user wants to try, kept across all weeks and both programs. From it, an exercise can be added to any day of the viewed week to try it. Trying it never changes the program, and past weeks never change when the list is tidied.

## Behavior

### The list (Experiment board)

- A full-width panel titled "Experiments" directly under the seven day columns. Entries sit in one horizontal row that scrolls sideways when there are many. On a phone it sits under the day being viewed and scrolls sideways too.
- An entry holds one exercise, a phase, and an optional note. It shows the exercise name, the phase, the note, and the user's last logged session of that exercise if any ("Last: 25 lb · 3 × 10", using the existing `describe`).
- **+ Add exercise** opens a sheet: the exercise picker used in the Program tab (pick an existing exercise or "+ New exercise…" with a name and optional video link, saved the same way as new exercises from the Program tab), a phase (or none), and a note. **Edit** opens the same sheet filled in.
- **Delete** needs a second press to confirm (the existing `ArmedButton`). It only removes the entry from the list; weeks it was added to keep their cards.
- **Add to [Day ▾] + Add** puts the entry into that day of the viewed week. The menu lists every day except the rest day; it starts on today's column when viewing the current week, otherwise on the selected day (phone) or Day 1. On desktop an entry can also be dragged onto a day column; the button means dragging is never required.
- The same entry can be added to several days and weeks. It stays on the list after being added.
- Empty state text: "Keep exercises you want to try here, then add them to a day."

### An added card on a day

- It is a normal single card for that week only: check off (logs the planned numbers, as now), log sets, set phase, skip, move, and it follows day swaps and the rest-day shift. It counts in the day's and week's totals, the day date, and Progress (its logs are stored under the exercise like any log).
- It is grouped under its own "Experiment" section heading in the column and carries an "Experiment" tag.
- **Remove** (next to Skip, only on these cards) takes it off this week. Removing first unchecks it, so a check-off's auto-logged entry is removed; logs the user entered by hand stay in their history.
- Next week it is gone from the day; the entry is still on the list.

### Accessibility (WCAG 2.2 AAA)

Real buttons and labelled selects, 44 px targets, names that include the exercise ("Add Cable Lateral Raise to Day 3", "Delete Cable Lateral Raise"), the panel is a labelled section, and nothing requires dragging.

## Data

- **Entries:** `experiments/main` document `{ items: [{ id, ex, ph, note }] }`, saved like `library/main`. `id` is a unique string; `ex` an exercise id; `ph` a phase key or null; `note` a string (may be empty). Loaded into store state `experiments` with the same loading, ready-flag and save-queue pattern as `library`.
- **Added cards:** `week.extra`, an array of `{ id, day, ex, ph, note }` on the week document.
  - `id` is unique and starts with `X-`; it is the card's slot id, so check-offs, skips, moves, phases and log entries key off it as they do for program cards.
  - `day` is a program day 1..7 (stored like `week.moved`), so the card follows swaps and the rest-day shift.
  - `normWeek` keeps only well-formed entries (valid id, integer day 1..7, non-empty `ex`, `ph` a phase key or null, `note` a string) and omits the field when empty.
- **One merge:** `weekSlots(prog, week)` returns the program's slots followed by the week's extra cards turned into slots `{ id, day, type: 'single', sec: 'Experiment', experiment: true, items: [{ ex, ph }], note }`. Every place that builds a week's card list uses it: the store's `activeSlots` (and so every store action and `slotById`), the Board, `weekSummary` (Progress and Trends), the Muscles tab's live view, the Excel week workbook's Plan sheet, and the check-offs rebuilt from logs on import. Program-only views (the Program tab, the 1RM table in Settings) keep using `slotsFor`.
- **Store actions:** `addExperiment({ ex, ph, note })`, `editExperiment(id, patch)`, `deleteExperiment(id)`, `addToDay(entryId, column)` (maps the displayed column to a program day with `dayAt`; refuses the rest column), `removeExtra(slotId)` (unchecks, clears skip/move/phase keys for that card, removes it from `week.extra`).
- **Persistence:**
  - JSON data file: a top-level `experiments` array; `normalizeData` validates it; older files without it import with an empty list.
  - Excel full backup: a new `Experiments` sheet (`Id`, `Exercise id`, `Exercise`, `Phase`, `Note`), read back when present. It is optional, so workbooks made before this change still import as full backups.
  - Weeks: `week.extra` is part of the weekly JSON data; in the Excel `Check-offs` sheet each card is one `extra` row whose value is the card as JSON text; `readWeeks` parses it and `normWeek` validates it.
  - Import "replace" replaces the list; "merge" adds entries whose id is new (as saved versions do). `mergeWeek` unions `extra` by id, this device's copy winning.
  - The week backup fingerprint includes the normalized `extra`.
  - Erase: the "programs" part also clears the Experiment list.

## Out of scope

Supersets or pairs on the list, starting weights or custom sets × reps on entries, promoting an entry into the program, per-program lists, video links on entries beyond what "+ New exercise" already stores on the exercise.

## Testing

Written first (TDD), next to the existing tests:
- `weekSlots`: program slots plus extra cards in the right shape; no extras; an invalid extra dropped.
- `normWeek`: keeps valid extras, drops malformed ones, omits an empty array.
- Store: add/edit/delete entries (saved); `addToDay` after a swap and with a rest day (refused on the rest column); added cards in `activeSlots`, tallies and `weekSummary`; check-off auto-logs an added card; `removeExtra` removes the auto log, keeps a hand log, and clears its keys; deleting an entry leaves added cards alone.
- Persistence: JSON and Excel round trips for entries and `week.extra` (including an Excel re-save); a workbook without the `Experiments` sheet still imports whole; import merge by id; `mergeWeek` union; fingerprint changes with `extra`; erase clears the list.
- The panel, the add sheet, drag onto a day, phone layout and focus are checked by hand in the running app (no component test setup), before merging.

## Docs

HelpSheet and README: one entry each for the Experiment board. Tick the TODO item.
