# TODO

Work through these in order, one at a time, and check for bugs after each.

## Done

- [x] Convert to React, meet WCAG 2.2 AAA, make it an installable offline PWA (#14)

## 1. Fix imports and pick one file format (before the backend)

- [x] Excel import bug: no failing file turned up (the re-saved-dates bug was already fixed in #16). The real gap was that workbooks only brought back part of the data; see the next item.
- [x] Make Excel (.xlsx) the one format for both export and import. Programs, saved versions, check-offs, config, sessions and body weight each have a sheet, and an exported workbook imports back the same as the JSON file.
  - Still to do: remove the old partial-import path for workbooks made before this change, once nobody has those.
- [x] Accept CSV as an import fallback only (sessions only).
- [x] Keep JSON import until the backend exists, because it is the only full-detail backup for now. It gets removed in step 4.

## 2. Board and exercise changes (before the backend)

These change how days and exercises are stored. Do them together so the data structure is settled before it goes into a database.

- [x] Add a Day 7 to the board. It starts empty, and exercises can be added whenever.
- [x] Add a Rest day checkbox to each day. Ticking it inserts a rest day there and moves the later workouts one day later (blocked while Day 7 has exercises). A rest day counts as a complete day, and its exercises aren't in it, so volume numbers aren't inflated.
- [x] Add an exercise to the current day from the board.
- [x] Add stretches to the board, as a card type that doesn't need weight or reps.
- [x] Add an optional video link to each exercise.
- [x] Specify equipment for each exercise (dumbbell, bar, machine, bodyweight, etc.).
- [x] Add a Filter to sort exercises on the board by muscle group.
- [x] Set a default phase for an exercise that applies to all future instances of that exercise.
- [x] Add spinal waves as a bodyweight mobility exercise.

## 3. Backend, database and Google login (together)

- [ ] Choose a backend. Firebase (Google sign-in plus Firestore) fits `src/lib/storage.js`, which already saves through an optional Firestore-like `db`. Supabase is the other option for a SQL database.
- [ ] Add Google login. Each user's data is tied to their account.
- [ ] Keep it offline-first for gym use: queue saves and sync them later, building on `makeSaveQueue`.
- [ ] Add a one-time "upload my existing data" step so data already on the phone isn't lost.
- [ ] Possibly exercise catalog what api to use any free options

## 4. Remove the stand-in features (only once the backend is working)

- [ ] Remove GitHub backup and restore (#18).
- [ ] Remove JSON import.
- [ ] Stop using localStorage as the main place data is saved.
- [ ] Turn "Erase data" into "delete my account data".
- [ ] Update the README and the training skill with each removal so they stay in sync.

## 5. Advanced features and integrations (post-backend)

- [ ] Google Fit API integration to pull activity and weight data.
- [x] Weight goals feature (set targets and track progress).
- [ ] Import medical records and add AI assessment of medical information.
- [ ] Warn when you skip an exercise too many times that's on your program.
- [ ] Improve weight entry UX: catch and prevent common mistakes (e.g., wrong weight entered for an exercise).

## 6. UX improvements and fixes

- [x] Keep the tab and the phone day picker across a page refresh (per browser tab; a fresh open starts clean).
- [x] Always open on the current week, and an app left open past the end of the week moves on to the new one.

## 7. Optional UI improvements (not decided yet)

From a review of the current screens. None of these are committed to: pick what you want, and move it into the numbered steps above. The numbers match the list from that review so they can be referred to. Where each one goes relative to the backend (step 3):

- **Before the backend** if it changes what gets stored.
- **Any time** if it is only how things look. These don't touch saving, so they can go before or after.
- **After the backend** if it depends on the backend, or gets reshuffled by step 4.

### Before the backend (changes what is stored)

- [ ] 55. Exercise library page: every exercise with its equipment, video link, default phase and muscle tags, edited in one place. This settles how per-exercise settings are stored, which is easier to do before they go into a database.
- [ ] 38. A tick per set in the Log sheet (and start the rest timer between sets). Changes the shape of a logged entry.
- [x] 33. Undo after unchecking something you logged: the board shows how many entries were removed with an Undo that puts back the entries and the tick.

### Any time: phone and board layout (most useful first)

- [ ] 1. Show the first exercise sooner on phones: less above the day tabs.
- [ ] 2. Slim down the top of each day column (rest day, add buttons, swap arrows, warm-up).
- [ ] 3. Stop the Rest timer button covering cards and the add buttons.
- [ ] 4. Mark today: highlight today's column on desktop, open on today's tab on phones.
- [ ] 60. "Gym mode" on phones: only today's exercises, big checkboxes and the timer.
- [ ] 25. Fit all 7 days on desktop (narrower columns or a compact density) with clear scrolling.

### Any time: header, week bar and notices

- [ ] 6. Remove the repeated program/mode between the header pills and the week bar.
- [ ] 7. Move the mode dropdown into Settings.
- [ ] 8. Put "Set by month" next to the A/B toggle it explains.
- [ ] 9. Fold overall progress into the week title on phones ("Sep 20 – 26 · 17/62").
- [ ] 10. Shrink the "This week" button.
- [ ] 11. Smaller leftovers notice: a one-line strip that opens the choices.
- [ ] 12. Show the move heads-up near the moved card, or as a short message at the bottom, instead of pushing the board down.

### Any time: body weight row and sort/filter

- [ ] 13. Make the body weight row compact on desktop.
- [ ] 14. Once logged, show it as one line ("195 lb · −2 · Goal: 15 to go").
- [ ] 15. Fix the body weight input showing "lb" twice.
- [ ] 16. One "Sort & filter" button instead of two large dropdowns.
- [ ] 17. Show active sort/filter as removable chips.
- [ ] 18. Quick search to jump to an exercise by name.

### Any time: day columns and cards

- [ ] 19. Group the column controls (rest day, swap, only this week) into a "⋯" menu.
- [ ] 20. Move "+ Add exercise" to the bottom of the column.
- [ ] 21. Bigger or menu-based swap arrows.
- [ ] 22. Collapse the warm-up once it's done.
- [ ] 23. Collapse finished days into a summary.
- [ ] 24. Explain an empty day ("Nothing planned · + Add exercise") instead of 0/0.
- [ ] 26. Let section headings (Regular, Supersets, Home) collapse.
- [ ] 27. Make Details a small icon next to the name.
- [ ] 28. Keep exercise names on one line where possible.
- [ ] 29. Make phase easier to see without relying on color (letter or icon).
- [ ] 30. Put target weight, sets × reps and last time on one line.
- [ ] 31. Shrink finished cards to the name and a tick.
- [ ] 32. Show the tag line ("Primary · Superset") only when it matters, or as a colored card edge.
- [ ] 40. Rename "Same as last" on the card to show what it logs ("Repeat 320×6").
- [ ] 56. One button style for the two add buttons.

### Any time: Log sheet and timer

- [ ] 34. Put rarely used fields (1RM, video link, equipment, default-phase boxes) under "More options".
- [ ] 35. Date as a small "Today ▾" chip.
- [ ] 36. Keep Save and Cancel pinned to the bottom of the sheet.
- [ ] 37. Fix the "up from 320 lb" note floating to the right of the target.
- [ ] 39. +/− 5 lb and +/− 1 rep buttons.
- [ ] 41. Dock or shrink the Rest timer button, and move it up when a sheet opens.
- [ ] 42. Show the running time on the Rest timer button.

### Any time: Progress, Muscles and Program tabs

- [ ] 43. Fill the empty gap in the Progress layout.
- [ ] 44. Move body weight and the goal up next to the other numbers.
- [ ] 45. Draw the weight goal as a dashed target line on the chart.
- [ ] 46. Add a phase legend to "Weight change by exercise".
- [ ] 47. Hide the "Sets, last 4 weeks" explanation until it's useful.
- [ ] 48. Tap an exercise in the weight change list to open its history.
- [ ] 49. Muscles: a "this week vs planned" toggle.
- [ ] 50. Muscles: mark low or untrained muscles on the body diagram itself.
- [ ] 51. Program: drag cards to reorder.
- [ ] 52. Program: a whole-week overview next to the one-day editor.
- [ ] 53. Program: show which program is being edited and which is on the board.

### Any time: across the app

- [ ] 57. Messages: short notices at the bottom of the screen, with Undo where it applies, instead of the easy-to-miss line under the header.
- [ ] 59. Recheck dark mode and contrast for the newer pieces (Mobility purple, equipment labels, goal bar).

### After the backend

- [ ] 54. Regroup Settings into Training, Data and App. Do this after step 4, because the Data section changes when GitHub backup and JSON import are removed.
- [ ] 58. First-run guide (pick a program, log a set, check a day). Do this once sign-in exists, so it can include signing in and syncing.

## Anytime

- [ ] Add a link to a Google feedback form in Settings.
