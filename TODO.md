# TODO

Work through these in order, one at a time, and check for bugs after each.

## Done

- [x] Convert to React, meet WCAG 2.2 AAA, make it an installable offline PWA (#14)

## 1. Fix imports and pick one file format (before the backend)

- [ ] Fix the Excel import bug. JSON imports work but Excel doesn't. Reproduce it with a real file that fails.
- [ ] Make Excel (.xlsx) the one format for both export and import. Put each table (program, logs, body weight, settings) on its own sheet so an exported file imports back unchanged.
- [ ] Accept CSV as an import fallback only.
- [ ] Keep JSON import until the backend exists, because it is the only full-detail backup for now. It gets removed in step 4.

## 2. Board and exercise changes (before the backend)

These change how days and exercises are stored. Do them together so the data structure is settled before it goes into a database.

- [ ] Add a Day 7 to the board. It starts empty, and exercises can be added whenever.
- [ ] Add a Rest lane. Dragging any day into it makes that day a rest day and checks it off, even if it has exercises.
  - Decide whether a rest day's exercises count as done in Progress. Recommendation: leave them out so volume numbers aren't inflated.
- [ ] Add an exercise to the current day from the board.
- [ ] Add stretches to the board, as a card type that doesn't need weight or reps.
- [ ] Add an optional video link to each exercise.

## 3. Backend, database and Google login (together)

- [ ] Choose a backend. Firebase (Google sign-in plus Firestore) fits `src/lib/storage.js`, which already saves through an optional Firestore-like `db`. Supabase is the other option for a SQL database.
- [ ] Add Google login. Each user's data is tied to their account.
- [ ] Keep it offline-first for gym use: queue saves and sync them later, building on `makeSaveQueue`.
- [ ] Add a one-time "upload my existing data" step so data already on the phone isn't lost.

## 4. Remove the stand-in features (only once the backend is working)

- [ ] Remove GitHub backup and restore (#18).
- [ ] Remove JSON import.
- [ ] Stop using localStorage as the main place data is saved.
- [ ] Turn "Erase data" into "delete my account data".
- [ ] Update the README and the training skill with each removal so they stay in sync.

## Anytime

- [ ] Add a link to a Google feedback form in Settings.
