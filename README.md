# Iron Log

A single-page workout tracker built around a weekly board. It runs two training programs (A and B) on a rotation schedule, sets targets for each exercise by training phase, and shows which muscles a program trains.

Plain HTML, CSS and JavaScript. There is no build step, no framework and nothing to install.

## Features

- **Weekly board.** One column per training day (Sunday to Saturday week). You can check off exercises one at a time or a whole day at once. When equipment is taken, drag a card to another day (or use "Move to" on a phone). Day 5 is a make-up day that can pull in anything left unfinished.
- **Program rotation.** There are three modes:
  1. Program A only.
  2. A and B alternate by month (even and odd months), and you can switch any single week by hand.
  3. A and B swap every 6 months.
- **Training phases.** Every exercise is tagged Strength, Isometric, Hypertrophy or Explosive, with a default sets × reps for each. You can change the phase for a single week or save it as the new default.
- **Targets.** Enter a 1-rep max and the target becomes 1RM × the phase's %. Without a 1RM, the target is your last logged weight in that phase.
- **Suggestions to go heavier.** After two separate days in a row with every set completed, the target goes up by +2.5 lb (under 50 lb) or +5 lb. For isometric work, it waits until you've held 30 s on every set.
- **Fast logging.** Log weight, sets and reps (or hold seconds for isometrics). A "Same as last" button repeats your previous entry in one tap.
- **Timers.** A hold countdown on isometric exercises that rests between sets and starts the next hold, plus a general rest timer.
- **Progress.** A weight-over-time chart for each exercise, a 12-week record of days completed, and CSV export.
- **Muscle map.** Front and back body diagrams shaded by weekly sets per muscle group. Tap a muscle to see the exercises that train it. You can edit the muscle tags for any exercise.
- **Program editor.** Add, edit, reorder and remove exercises (single, superset or either/or) for any day of either program.
- **Works on phones.** On a phone you see one day at a time and swipe between days, with bottom navigation and large tap targets. It follows light and dark mode.

## Running it

- **Locally:** open `index.html` in a browser, or serve the folder (`python3 -m http.server`) and open `http://localhost:8000`.
- **Hosted:** enable GitHub Pages for this repo (Settings → Pages → deploy from the `main` branch, root folder) and open the Pages URL.

## Project layout

```
index.html        page markup
styles.css        all styles (light and dark themes)
js/data.js        built-in programs, exercises, phases
js/state.js       dates, settings, storage, helpers
js/render.js      board, progress, settings and log screens
js/timers.js      hold and rest timers
js/muscles.js     muscle map and exercise→muscle tags
js/editor.js      program editor
js/events.js      input handling and startup
```

The scripts are plain (non-module) scripts loaded in order and share one global scope.

## Where data is stored

Run on its own, the app saves everything in your browser's `localStorage`. That data stays on that device and that browser only, and clearing site data erases it. Use **Export log (CSV)** on the Progress tab to keep a backup.

When it's published as a Claude artifact, it uses the artifact's shared database instead (`window.claude`), so the log follows you across devices. The code checks which of the two is available and picks it at runtime.

## Customizing

The two built-in programs are the `PROGRAM_A` and `PROGRAM_B` objects in `js/data.js`. The default muscle tags are in `MUSCLE_MAP` in `js/muscles.js`. You can also change both from inside the app (the Program tab, and Edit on the Muscles tab), and those changes are saved on top of the built-in defaults.

The phase percentages (Strength 85%, Isometric 75%, Hypertrophy 65%, Explosive 45%) are placeholders. Change them in Settings.

## Notes

- Muscle tags are approximate, and "weekly sets" counts secondary work as half a set. Treat the muscle map as a rough guide to coverage, not an exact measure.
- This is a personal training log, not medical or coaching advice.

## License

MIT. See [LICENSE](LICENSE).
