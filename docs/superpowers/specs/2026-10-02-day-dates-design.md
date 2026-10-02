# Day dates on the board, and seven mobile day tabs on one row

## Goals

1. On a phone, all seven day tabs fit on one row.
2. Once something on a day's board has been checked off, the board header shows the weekday and date it was done, like "Sunday 09/27". A ticked rest day shows its date too.

The intent behind (2): the user checks off an exercise only on the day they did it. If they can't finish a day's program they log fewer sets, skip an exercise, move it, or swap days; they don't carry an exercise into the next day. So a board's check-offs all belong to one calendar day, and the label just says which day. Nothing is blocked or restricted.

## Behavior

- **Mobile tabs.** The tab strip is 7 equal columns that cannot push each other wider (`repeat(7, minmax(0, 1fr))`), so Day 7 stays on the same row at phone width. Tab text ("D3 Rest", "10/12", "✓") must fit at 360 px.
- **Exercise date.** A board's date is the earliest date among the log entries of the cards currently in that column, for the viewed week. A check-off already writes a log entry (using `defaultLogDate`: today when viewing the current week, otherwise the week's first day), and hand-logged sessions carry their own date, so no new data is stored for exercises. Unchecking removes the auto entry, so the label disappears; a hand-logged session keeps it. Skipped cards have no entry. If a board somehow has several dates, the earliest wins.
- **The date follows the workout.** It is computed from the cards in the column, so it stays with the workout when days are swapped, and a card moved in carries its date with it.
- **Rest day date.** Ticking Rest day saves that day's date with the week as `week.restOn` (`YYYY-MM-DD`, from `defaultLogDate`). Unticking removes it. Moving the rest day (ticking another day, or the swap arrows) keeps the existing date. It is only valid while `week.rest` is set.
- **Where it shows.** A line in the column header under the day title, above the day's subtitle, in the rest column too. Before anything is checked off nothing extra shows. The phone day tabs are unchanged.
- **Format.** Long weekday name plus zero-padded month/day: `Sunday 09/27`. The weekday comes from a fixed name list, not the locale, so the label is stable.

## Data

- `week.restOn`: string `YYYY-MM-DD`, present only when `week.rest` is set; `normWeek` keeps it only if it matches that pattern and `rest` is valid.
- `dayDate(cards, logs, weekKey)` in `src/lib/logic.js`: earliest `d` over `logs[item.ex]` entries with `e.slot === card.id` and week equal to `weekKey` (the existing `weekOfEntry` rule: `e.wk` or the week of `e.d`), or `null`.
- `fmtDayDate(dateString)` in `src/lib/dates.js`: `'2026-09-27'` becomes `'Sunday 09/27'`.
- Store: `setRestDay` sets `restOn` when a rest day is ticked and none is set (kept when moving), deletes it on untick; `swapDays` leaves it alone.
- Persistence, alongside `week.rest`: JSON weekly data (it comes with the rest field); a `restOn` row kind in the Excel `Check-offs` sheet (value read through the same date-text handling the week column uses, so an Excel re-save that turns it into a date still imports); `mergeWeek` keeps this device's value and falls back to the other side's; the week backup fingerprint includes it.

## Out of scope

Blocking or warning about check-offs on several boards in one day, dates on the phone tabs, editing a date by hand, dates for skipped cards.

## Testing

Written first (TDD), next to the existing tests:
- `fmtDayDate`: the weekday and padded date for several dates, including a Sunday (2026-09-27) and single-digit months and days.
- `dayDate`: none when nothing is logged; the earliest of two entries; only this week's entries; only the column's cards (moved-in counted, moved-out not); hand-logged entries count; skipped cards add nothing.
- `normWeek`: keeps a valid `restOn` with a rest day; drops it without `rest` or when malformed.
- Store: `setRestDay` stamps `restOn`; untick removes it; moving the rest day and swapping keep it; a check-off yields a log date that `dayDate` reads back.
- Persistence: JSON and Excel round trips, including an Excel re-save; merge precedence.
- The CSS fix and the header layout (date line, wrapping at 270 px) are checked by hand in the running app, since there is no component test setup. As with the last two features, these must be run in a browser before merging.

## Docs

Update HelpSheet and the README feature list with one line about the date labels.
