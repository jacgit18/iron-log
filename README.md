<p align="center">
  <img src="docs/images/banner.png" alt="Iron Log: a weekly training board for A/B program rotation, phase-based targets and a muscle map" width="100%">
</p>

<p align="center">
  <a href="https://jacgit18.github.io/iron-log/"><b>Open the app</b></a> ·
  <a href="#features">Features</a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#running-it">Running it</a>
</p>

<p align="center">
  <a href="https://jacgit18.github.io/iron-log/"><img alt="Live on GitHub Pages" src="https://img.shields.io/badge/live-GitHub%20Pages-1F5E5B"></a>
  <img alt="React and Vite" src="https://img.shields.io/badge/stack-React%20%C2%B7%20Vite%20%C2%B7%20Zustand-1F5E5B">
  <img alt="Installable, works offline" src="https://img.shields.io/badge/PWA-installable%20%C2%B7%20offline-1F5E5B">
  <img alt="Built to WCAG 2.2 AAA" src="https://img.shields.io/badge/accessibility-WCAG%202.2%20AAA-1F5E5B">
  <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-1F5E5B"></a>
</p>

Iron Log is a single-page workout tracker built around a weekly board. It runs two training programs (A and B) on a rotation schedule, sets targets for each exercise by training phase, and shows which muscles a program trains.

It's a React app built with Vite. You can install it on your phone or computer like any other app, and it works with no connection. It was built and tested against WCAG 2.2 at level AAA.

## Screenshots

<sub>Screenshots use sample data.</sub>

![Weekly board with seven days (six training days and a rest day), check-offs and phase-tagged exercise cards](docs/images/board.png)

| Phone: one day at a time | Logging a set | Isometric hold timer |
| :---: | :---: | :---: |
| <img src="docs/images/mobile-board.png" alt="Phone view of the board" width="260"> | <img src="docs/images/mobile-log.png" alt="Log sheet with a suggested heavier target" width="260"> | <img src="docs/images/mobile-timer.png" alt="Hold timer counting down" width="260"> |

| Muscle map | Progress |
| :---: | :---: |
| <img src="docs/images/muscles.png" alt="Front and back body map shaded by weekly sets" width="420"> | <img src="docs/images/progress.png" alt="Weekly history and per-exercise charts" width="420"> |

<details>
<summary>More: dark mode, muscle detail, program editor</summary>

![Board in dark mode](docs/images/board-dark.png)
![Muscle detail listing the exercises that train the hamstrings](docs/images/muscles-detail.png)
![Program editor](docs/images/editor.png)

</details>

## Features

- **Weekly board.** One column per training day (Sunday to Saturday week). You can check off exercises one at a time or a whole day at once. In a superset each exercise has its own checkbox and counts on its own; an either/or counts once, whichever option you do. When equipment is taken, drag a card to another day (or use "Move to" on a phone). If the move puts an exercise on the same day as, or the day next to, another session of that exercise, a heads-up says so, offers to move it back, and suggests the nearest day where it wouldn't clash. The make-up day (normally Day 5) is for anything skipped earlier in the week. When yesterday still has unchecked exercises, a notice offers to skip them all or move them all to a later day. **Skip** takes an exercise out of this week's counts without deleting it, and checking it off later undoes the skip. Checking off an exercise you haven't logged also logs its planned numbers (the target weight and sets × reps on the card), marked "from check-off", so it shows in Progress; unchecking removes that entry, and logging your real numbers replaces it. Done and skipped exercises drop to the bottom of their day, so what's left is always on top.
- **Experiments.** Keep exercises you want to try in a list under the board, and add one to any day of the week you're viewing. It's a normal card for that week only; your program doesn't change.
- **Rest day.** Tick Rest day on any day of the week and your workouts from that day on move one day later. Untick to put them back.
- **Swap days.** Small arrows on each day swap it with its neighbor for the current week. The next week starts in your program's normal order.
- **Day dates.** Each day's header shows the weekday and date once something on it is logged or checked off, so you can see which days you trained.
- **Program rotation.** There are three modes:
  1. Program A only.
  2. A and B alternate by month (even and odd months), and you can switch any single week by hand.
  3. A and B swap every 6 months.
- **Training phases.** Every exercise is tagged Strength, Isometric, Hypertrophy or Explosive, with a default sets × reps for each. You can change the phase for a single week or save it as the new default.
- **Targets.** Enter a 1-rep max and the target becomes 1RM × the phase's %. Without a 1RM, the target is your last logged weight in that phase.
- **Suggestions to go heavier.** After two separate logged days in a row with every planned set completed at the working weight, the target goes up by +2.5 lb (under 50 lb) or +5 lb. For isometric work, it waits until you've held 30 s on every set.
- **Body weight.** Log it once a week from the top of the board. The Progress tab shows the latest weight, the change over about four weeks and a trend chart, and it's included in the Excel and data exports.
- **Fast logging, set by set.** The log sheet has one row per planned set, prefilled with the target weight and reps (or hold seconds for isometrics). Change set 1 and the rest follow until you edit them. A "Same as last" button repeats your previous session in one tap.
- **Stall alerts.** When your last 3 sessions of a lift (same phase, across at least 2 weeks) show no gain in weight or reps, the card and the lift list show a "Stalled" tag. It stays quiet while the app is already suggesting a heavier weight. Both of these use only sessions you logged, not ones logged by check-offs.
- **Timers.** A hold countdown on isometric exercises that rests between sets and starts the next hold, plus a general rest timer.
- **Progress.** Headline numbers for the week, sets logged per week, weight change by exercise over the last 8 weeks, a muscles-by-week heatmap of what you actually trained, a weight-over-time chart for each exercise (one line per phase when you train a lift in more than one) and a 12-week record of days completed.
- **Excel export.** Download an overall workbook (summary, every session with the muscles it trains, weekly sets per muscle, weekly totals, settings, plus the data sheets that let it import back whole) or a workbook for a single week, or export plain CSV. In the Claude version, **Back up to GitHub** commits the same workbooks to a private repo.
- **Export and import.** One JSON file holds everything: the log, weekly check-offs, programs, saved versions and settings. Import it with **Add to my data** (keeps what's here and fills in what's missing) or **Replace my data** (makes the app match the file). The Excel workbook holds the same data on its own sheets (Programs, Saved versions, Check-offs, Config, Sessions, Body weight), so it imports back whole through the same review. Workbooks exported by an older version are a partial backup: they bring back logged sessions (checking each one off on the board in the week it was logged), body weight, 1RMs and main settings, but not skipped or moved cards or edited programs.
- **Erase data.** Settings → Erase data wipes what you pick (logged sessions, weekly check-offs, body weight, edited programs and saved versions, settings and 1RMs) to start the tracker over, after a second tap to confirm. Display options, the GitHub token and backups already made are kept.
- **Muscle map.** Front and back body diagrams shaded by weekly sets per muscle group. Tap a muscle to see the exercises that train it. You can edit the muscle tags for any exercise.
- **Program editor.** Add, edit, reorder and remove exercises (single, superset or either/or) for any day of either program. Rename either program; the new name shows everywhere, while A and B still drive the rotation. **Create a program** from a copy of A or B: it lives in your program library, where you can build and rename it without touching the board, then load it into A or B when you're ready to train it. **Saved versions** keep named copies of a program; the built-in original is always kept, and loading a version saves the current one first so nothing is lost.
- **Works on phones.** On a phone you see one day at a time and swipe between days, with bottom navigation and large tap targets.
- **Install it, use it offline.** Install from Settings → App on this device (or Add to Home Screen on iPhone). Everything, including logging, the timers and Excel export, works without a connection. New versions wait for you: a banner offers to reload, so an update never interrupts a workout.
- **Accessible.** Full keyboard use, screen-reader labels and announcements, 7:1 text contrast in light and dark, 44×44 px tap targets, no time limits, and nothing shown by colour alone. **Help** explains the app and its training terms and abbreviations. Settings → Appearance picks light, dark or your device's setting, and roomier text spacing.

## Running it

- **Hosted:** open **[jacgit18.github.io/iron-log](https://jacgit18.github.io/iron-log/)**, then install it from Settings if you like.
- **Locally** (Node 20.19+ or 22.12+):

  ```bash
  npm ci
  npm run dev        # development server at http://localhost:5173
  npm run build      # production build in dist/ (set BASE_PATH=/iron-log/ for a sub-path)
  npm run preview    # serve the production build, with the service worker, to test offline and install
  npm test           # unit tests (Vitest)
  ```

## Where data is stored

Run on its own, the app saves everything in your browser's `localStorage`. That data stays on that device and that browser only, and clearing site data erases it. Use **Export all data** in Settings to keep a backup you can import again. When the app is installed, or you choose **Keep my data on this device**, it asks the browser not to clear that storage when space runs low.

On iPhone and iPad, the Home Screen app has its own storage, separate from Safari. To move a log between them, export from one and import into the other.

When it's published as a Claude artifact, it uses the artifact's shared database instead (`window.claude`), so the log follows you across devices. The code checks which of the two is available and picks it at runtime.

**Back up to GitHub** (Settings → Excel & backups) saves `iron-log.xlsx` and the full `iron-log-data.json` in one commit to the `data` branch of a repository, `jacgit18/iron-log` unless you change it. Each backup is a new commit, so the branch history keeps every backup, and the branch holds only those two files, so a backup never starts a deploy. It needs a fine-grained personal access token with **Contents: Read and write** on that one repository, pasted in once per device; the token stays in that browser and is never written into a backup. **Restore from GitHub** reads `iron-log-data.json` back through the usual import review (a public repository needs no token for this), which is how you set up a new phone. The Board reminds you when the last backup is a week old. In this repository `main` only changes through pull requests, so a backup token can't change the app.

The Claude version can also back up to a private GitHub repo through the viewer's GitHub connector. It writes `iron-log.xlsx`, the full `iron-log-data.json` export, plus `weeks/YYYY-MM-DD.xlsx` for each week that changed since the last backup. The Excel library (SheetJS) is bundled with the app and loads only when you use Excel.

## Project layout

```
index.html                    page shell
vite.config.js                build, PWA manifest and service worker settings
src/main.jsx                  startup (fonts, appearance, PWA)
src/App.jsx                   header, tabs, dialogs
src/styles.css                all styles (light and dark themes)
src/lib/data.js               built-in programs, exercises, phases
src/lib/logic.js              targets, stalls, progression, what counts as done
src/lib/muscles.js            muscle map shapes and exercise→muscle tags
src/lib/trends.js             Progress tab calculations
src/lib/export.js             CSV/Excel export, data file, GitHub backup
src/lib/github.js             GitHub REST calls for backup and restore (standalone app)
src/lib/excelImport.js        importing an Excel workbook
src/lib/storage.js            localStorage / Claude database save queue
src/lib/pwa.js                install and persistent-storage helpers
src/store/                    app state (Zustand): main store, editor, settings, timer
src/components/               Board, Progress, Muscles, Program, Settings, dialogs, charts
src/hooks/                    focus keeping and tooltips
public/                       logo and app icons
scripts/make-icons.mjs        renders public/icons/ from the logo
tools/screenshots.mjs         generates docs/images/ with sample data
tools/banner.html             README banner template
.github/workflows/            deploys to GitHub Pages; regenerates screenshots on feature branches
```

## Customizing

The two built-in programs are the `PROGRAM_A` and `PROGRAM_B` objects in `src/lib/data.js`. The default muscle tags are in `MUSCLE_MAP` in `src/lib/muscles.js`. You can also change both from inside the app (the Program tab, and Edit on the Muscles tab), and those changes are saved on top of the built-in defaults.

The phase percentages (Strength 85%, Isometric 75%, Hypertrophy 65%, Explosive 45%) are placeholders. Change them in Settings.

## Development

Changes are made on feature branches and merged into `main` through pull requests. Every pull request runs the **Tests** workflow (lint and unit tests). Every push to `main` runs the **Deploy to GitHub Pages** workflow, which lints, tests, builds for `/iron-log/` and publishes the result. (In the repository's Settings → Pages, the source must be **GitHub Actions**.)

When a pull request's branch changes the app, the **README screenshots** workflow regenerates `docs/images/` and commits the new images to that branch, so they merge along with the change. To run it locally:

```bash
npm ci
npm install --no-save playwright
npx playwright install chromium
node tools/screenshots.mjs      # builds the app, then takes the screenshots
```

`npm run lint` checks the code with oxlint. `npm test` runs the unit tests (`*.test.js` next to the code in `src/lib` and `src/store`). They cover the program rotation, done and skipped counts, check-offs, progression and stalls, the Progress numbers, muscle volume, the program editor, the timers, GitHub backup, and import and export. `src/test/fixtures/iron-log-data.v1.json` is a sample data file that pins down the backup format: if its test fails, the format changed, so bump the format number rather than editing the sample.

## Notes

- Muscle tags are approximate, and "weekly sets" counts secondary work as half a set. Treat the muscle map as a rough guide to coverage, not an exact measure.
- This is a personal training log, not medical or coaching advice.

## License

MIT. See [LICENSE](LICENSE).
