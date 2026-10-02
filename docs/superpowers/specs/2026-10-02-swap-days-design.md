# Swap days with arrows (this week only)

Roadmap: not yet on TODO.md; add under section 6 (UX) when the plan is written.

## Goal

Each day column on the board has small left and right arrows. Pressing one swaps that column with its neighbor for the viewed week, so the workouts trade places. Labels follow position: swapping the 6th and 7th columns makes the old Day 6 workout appear as "Day 7" and the old Day 7 as "Day 6".

## Behavior

- **This week only.** The swap is stored with the week. The program is never changed, and next week starts in the program's normal order.
- **Workouts travel.** Check-offs, logs, warm-up ticks, phases, skips and moved cards are keyed by workout (slot id, program day), so they move with it. A workout's subtitle and make-up flag travel with it. Day titles ("Day N") follow position, as the Rest day work already does.
- **Arrows.** Each column header has a left and a right arrow button. The first column has no left arrow and the last has no right arrow (hidden, not disabled). Pressing one swaps the column with its displayed neighbor. A short status message names the swap ("Day 6 swapped with Day 7").
- **The rest column** has the same arrows. Swapping a workout with the rest column moves the rest day one step: the rest day takes the workout column's position and the workout takes the old rest position. No other rule is needed.
- **Empty day.** Without a rest day, an empty day is an ordinary column and swaps like any other, so you can slide it to the end. With a rest day set, the board shows 6 workout columns plus the rest column; the 7th workout position (required to be empty, see the block rule) stays off the board, and arrows only reorder the visible workouts.
- **No room for a rest day.** The existing block (tick refused when a workout would be pushed off the board) now checks the workout in the last workout position, not literally program Day 7.
- **Phone.** Only the selected column shows. After a swap the selected day follows the workout that was moved (swapping Day 6 right leaves you viewing Day 7).
- **Accessibility (WCAG 2.2 AAA).** The arrows are real buttons, 44 px minimum target, operable by keyboard and touch, no dragging. Accessible names are descriptive ("Swap Day 6 with Day 7"); the arrow glyphs are `aria-hidden`. After a swap, focus moves to the same-direction arrow of the column the workout moved to (or the other arrow when that column is at the end), so repeated presses keep moving the same workout.
- **Moved cards.** `week.moved` still stores the workout (program day) a card was moved to. The "From Day N" badge on a card shows only for cards the user moved (`week.moved[id]` is set), and N is the displayed position of the card's home workout.
- **Not included:** drag-to-reorder columns, a "reset order" button, changing the program's order, multiple rest days.

## Data

- `week.order`: array of `DAY_COUNT` (7) integers, a permutation of 1..7. Entry `i` is the program day shown at workout position `i + 1`. Absent means identity. `normWeek` keeps it only when it is a clean permutation (every value an integer 1..7, no repeats, length 7) and omits it when it equals the identity, so a week with no swaps stores nothing new.
- Layout is derived in two steps; nothing stored is rewritten:
  1. A card's effective day is `week.moved[id] || slot.day` (program day). Its workout position is `order.indexOf(effective) + 1`.
  2. Its displayed column is `shownDay(week.rest, workoutPosition)`.
- Inverse (for drops and moves): displayed column `d` -> `programDay(week.rest, d)` gives the workout position (null for the rest column) -> `order[position - 1]` gives the program day to store in `week.moved`.
- Swap action `swapDays(d, dir)`, with `d` and `d + dir` displayed columns:
  - if either column is the rest column, set `week.rest` to the other column's index;
  - otherwise swap the two entries of `week.order` at the two workout positions. Setting the order back to the identity removes the field.
- Warm-up ticks stay keyed by program day, so they follow the workout.
- Persistence, alongside `week.rest`: JSON weekly data; an `order` row kind in the Excel `Check-offs` sheet (value written space-separated, `3 1 2 4 5 6 7`, so Excel never reads it as a number or date; the reader accepts spaces or commas); both importers; `mergeWeek` keeps this device's order and falls back to the other side's; the week backup fingerprint includes the normalized order; a week with only an order is kept in the JSON file. Excel re-saves may turn the value into text, so the reader splits and validates it.
- Consumers that must use the two-step mapping instead of `shownDay` alone: `currentLayout`, `restBlocked`, `moveSlot`/`undoMove`, `setWarm`, `checkDay` (already displayed), the Muscles tab's live day (`muscles.js`), the Excel week workbook's Plan sheet ("Planned day" and "Done on day" are displayed positions), and the Board's per-column day definition (`prog.days[workout - 1]` for the subtitle and make-up flag).
- `weekSummary` (Progress and Trends) already reads `currentLayout`, so it needs no separate change.

## Testing

Written first (TDD), next to the existing tests:
- Layout: an order alone; an order plus a rest day; a card moved to a workout that has been swapped.
- Swap action: neighbors, both ends, a swap that crosses the rest column (moves the rest day), a swap that restores the identity (field removed), and the "no room" check with a swapped last workout.
- `normWeek`: accepts a valid permutation, drops duplicates, wrong length, out-of-range and non-integers, and drops the identity.
- Moves: a drop on a displayed column after a swap lands on the right workout; undo restores.
- Warm-ups and check-offs stay with their workout across a swap.
- Persistence: JSON and Excel round-trips (including an Excel re-save with the value as text); merge precedence.
- The board arrows, the phone behavior, focus after a swap and the status message are checked by hand in the running app (no component test setup exists). Last time the UI could not be run during the build, so these checks should be done before merging.

## Docs

Update HelpSheet (add the arrows and what a swap does) and the README feature list in the same change.
