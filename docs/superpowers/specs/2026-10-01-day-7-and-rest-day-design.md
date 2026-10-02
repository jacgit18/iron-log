# Day 7 and the Rest day checkbox

Roadmap item: TODO.md section 2, "Add a Day 7" and "Add a Rest lane" (the lane became a checkbox, see Decisions).

## Goal

The board covers all 7 days of a week. The user trains 6 days, so one day each week is a rest day. They mark it with a checkbox, the workouts after it shift one day later, and a normal week reads 7 of 7 days complete.

## Behavior

- **Day 7.** Every program has 7 days. The 7th starts empty. Exercises can be added to it like any other day.
- **Rest day checkbox.** Each day header has a "Rest day" checkbox. Ticking it on Day N inserts a rest day at position N. The workouts that were on Days N to 6 appear on Days N+1 to 7. Position labels renumber ("Day 4" is whatever sits fourth), so the last column always reads Day 7. A day's subtitle and make-up flag travel with its workout.
- **One rest day per week.** Ticking a different day's box moves the rest day there. Unticking restores the original layout exactly.
- **Blocked when full.** If the last displayed day has any exercises (so the shift would push a workout off the board), the tick is blocked with a short message: "Day 7 has exercises, so there's no room to add a rest day. Move or clear them first."
- **Counting.** The rest day counts as a complete day and has no exercises, so it adds nothing to exercise totals or volume. A week with a rest day reads 7 of 7 when everything is done.
- **Moving cards.** Dropping or moving a card onto a displayed day maps back to the correct program day. The rest day column is not a valid target.
- **Per week.** The rest day is stored with the week, so each week can differ. It never changes the program.

## Data

- `DAY_COUNT = 7` is one constant, replacing the hardcoded 6 and `[1..6]` in the board, tabs, swipe and keyboard handling, editor, card and slot move menus, `currentLayout`, `trends.js`, and the "of 6 days" texts in Progress, Trends and the Excel summary.
- `week.rest = N` (absent when no rest day). The layout is derived: a card's displayed day is its effective day (`week.moved[id] || slot.day`), plus one if a rest day is set at or before it. Nothing in `moved`, `done` or the logs is rewritten.
- **Migration.** `resolveProgram` ([data.js:210](../../../src/lib/data.js#L210)) and the import validators ([export.js:174-175](../../../src/lib/export.js#L174-L175)) accept programs with 6 days and append an empty Day 7. Built-in programs A and B get the empty Day 7 too.
- **Export and import.** `week.rest` is written to the weekly data in the Excel workbook and the JSON backup and read back by both importers, so a backup round-trips whole.

## Out of scope

Multiple rest days in a week, a Rest lane or drag target, moving a rest day by dragging, and the Experiment board (its own TODO item).

## Testing

Written first (TDD), alongside the existing test files:
- Layout derivation: rest at each position, none, and unticking.
- Tally and trends: the rest day counts as complete; its slot contributes no exercises; a no-rest week with an empty Day 7 reads 6 of 7.
- The block rule when the last displayed day has exercises.
- Card moves map displayed days back to program days around the rest day.
- Migration: a 6-day program, saved version or backup gains an empty Day 7.
- A round-trip through the Excel workbook and JSON that keeps `week.rest`.
- Components: the repo has no component test setup, so the checkbox, blocked-tick message, renumbered labels and the "Rest" day tab are checked by hand in the running app. The logic they use lives in tested lib and store functions.

## Docs

Update HelpSheet (the "D1 to D6" text) and the README in the same change.
