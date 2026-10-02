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

## Anytime

- [ ] Add a link to a Google feedback form in Settings.
