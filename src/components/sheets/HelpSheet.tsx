import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.jsx';

const GLOSSARY = [
  ['1RM (one-rep max)', 'The heaviest weight you can lift once with good form. It is kept for reference and doesn’t set targets. Set it in Program, Exercise library (Edit), or in Settings, Training.'],
  ['lb', 'Pounds, the unit for every weight in the app.'],
  ['Bodyweight', 'No added weight: the exercise uses your own body.'],
  ['Sets × reps', 'How much to do, for example 4 × 6 means 4 sets of 6 repetitions. For holds, 4 × 30 s means 4 holds of 30 seconds.'],
  ['Starter programs', 'On an empty board: Push / Pull / Legs, Upper / Lower, Full body and 5 × 5, each with a choice of days a week. Use this fills your program; change anything later in Program. Starters have sets and reps but no weights: type the weight at your first session.'],
  ['Experiments', 'A list under the board of exercises you want to try, for example one you saw on Instagram, TikTok or YouTube. + Add experiment, pick or type the exercise, and paste the post into Video link: the card then has a Watch link to it. Pick a day under Add to, then This week only to try it there this week (or drag it onto a day), or To program to add it to your program every week. Remove on the board card’s ⋯ takes it off the day again; the list keeps it for later weeks. Stretches has its own list (+ Add stretch, To my stretches).'],
  ['Video link', 'A link to a video of the exercise, from any site. It is kept with the exercise, so every card of it shows ▶ Watch on YouTube, Instagram, TikTok and so on. Set it when you add the exercise, in Log, or in Program, Exercise library (Edit).'],
  ['Add to program', 'Each day has + Add to program. It opens the add sheet where you pick Primary or Accessory, single, superset or either/or, and the days, and it joins your program every week. + This week only adds a one-week card instead (⋯, Remove takes it off again). On the Program tab, + Add exercise does the same for the day being edited.'],
  ['Library / Custom', 'When you type an exercise name, matches come from your own exercises and from the shared exercise catalog. Library means it came from the catalog (name, equipment and muscles filled in); Custom means you made it. Or pick Create to add a new one.'],
  ['⋯ (card menu)', 'On each card: Move to another day, Skip it for this week, or Remove a one-week card. A skipped card shows Undo skip. On a phone, the ⋯ in a day header holds Rest day and the swap arrows.'],
  ['Swipe (phone)', 'Swipe a card right to mark it done, left to skip it, and either way again to put it back. Swipe across the board to change day. In a superset or either/or card each exercise swipes on its own: right ticks it, left skips it. The card moves down only when every exercise or option in it is skipped. The checkboxes and the card’s ⋯ menu do the same without swiping.'],
  ['Storage full / Not saved', 'The note at the bottom says Storage full when the browser refused to keep a change (the device is out of space, or the browser is blocking storage), and Not saved, retrying… when a save did not go through yet. Nothing is lost while the page stays open; free some space, export your data from Settings, Data, and try again.'],
  ['Could not read saved data', 'Some saved data was damaged and the app could not read it. It did not write over it: a copy was kept on this device, and the problem was reported without your data. Tap anywhere to clear the note. The copies stay on this device until you clear this site’s data in the browser (signed-in accounts can also use Delete my data in Settings).'],
  ['Undo', 'Skipping, unticking a logged card or removing something shows a note at the bottom with Undo. Deletes take two taps: the first marks the row, the second removes it.'],
  ['Exercise library', 'Program, Exercise library lists every exercise you use. Search, filter by equipment, muscle or Custom / Library, and edit one in one place: changes apply everywhere it is used. Your equipment lists what you can pick; Add equipment… in any Equipment menu adds your own.'],
  ['Sort & filter', 'Above the days (on a phone, tap Sort & filter first). Sort by muscle lists the cards that train that muscle first in each day (primary, then secondary, then the rest). Equipment hides cards that use something else. The day counts stay the same.'],
  ['Phase', 'The goal of an exercise right now. Each phase has its own sets, reps and share of your 1RM. Pick one on the card for this week, in Log for the slot, or in Program, Exercise library (Edit) for every card. Mobility is for stretching and mobility work: like Isometric its sets are holds in seconds, and it has no share of a 1RM.'],
  ['Strength', 'Heavy weight, few reps (about 85% of your 1RM).'],
  ['Isometric (ISO)', 'Holding still under load instead of moving, timed in seconds. The Hold N×Ns button runs the timer.'],
  ['Hypertrophy', 'Moderate weight, more reps, to build muscle size (about 65% of your 1RM).'],
  ['Explosive', 'Light weight moved as fast as possible, for power (about 45% of your 1RM).'],
  ['Target', 'The weight suggested for today: the weight you last logged in that phase, or else the program weight.'],
  ['Same as last', 'On a card: logs your last session of that exercise again at once. In the Log sheet, Fill last copies it into the rows so you can change it first.'],
  ['Rest timer', 'The Rest timer button on the Board starts a countdown between sets (−15, +15, Pause, Stop). Settings, App, Rest timer alert can show a notification when it ends while the app is in the background.'],
  ['Stalled', 'A lift is judged on its best session of each week, so lighter days in the same week don’t count against it. Stalled means your last 3 weeks of it didn’t go up in weight or reps. Check sleep and other lifts that hit the same muscles before pushing harder. Explosive and Mobility are never flagged: power work progresses on speed, not weight.'],
  ['Back off', 'Strength: a set fell to 2 or more reps under the target (4 or fewer on 4 × 6) in 2 sessions in a row, so drop 5–10% and build back up. Isometric: a hold fell short of the bottom of the range (15 s) in 2 sessions in a row, so drop one weight step.'],
  ['Superset (A → B)', 'Two exercises done back to back. Each has its own checkbox.'],
  ['Either / or', 'Do one of the two, whichever equipment is free. It counts once.'],
  ['Primary / Accessory', 'Main lifts of the day, and the smaller supporting exercises.'],
  ['Primary / secondary muscles', 'Muscles an exercise mainly works, and ones it works less. Secondary work can count as half a set on Progress, Muscles.'],
  ['Mobility', 'Stretching or movement work. It isn’t counted toward any muscle.'],
  ['Warm-up', 'Short exercises at the top of each day on the Stretches board. Tap Edit to add your own or remove any; the list is the same on every day.'],
  ['Every day / Once in a while', 'How a stretch is used. Every day stretches are on the Stretches board each day, Once in a while ones sit under them, and Library only ones wait in Program, Stretch library.'],
  ['Make-up day', 'Day 5 is meant for anything you skipped earlier in the week. Use ⋯, Move to (or drag the card) to put exercises there.'],
  ['Unchecked yesterday', 'When yesterday still has exercises with nothing checked, a notice at the top of the board offers to skip them all or move them all to a later day. Not now hides it until tomorrow.'],
  ['Skip', 'Leaves an exercise out of this week’s counts without deleting it.'],
  ['D1 to D7', 'Day 1 to Day 7 of the week’s plan.'],
  ['Rest day', 'Tick Rest day on a day to rest (on a phone it is under the day’s ⋯). Your workouts from that day on move one day later, and the rest day counts as done. Untick to undo. You can tick more than one. If a rest day would push workouts off the end of the week, you’re asked to skip them for that week (they come back when you untick) or cancel and move them yourself first.'],
  ['Swap arrows', 'The ← and → on each day (under the day’s ⋯ on a phone) swap it with the day beside it for this week only. The workouts trade places and the day labels stay in order. Swapping with a rest day moves that rest day.'],
  ['Injury prevention', 'Settings, Training. When on, moving a card warns you (Heads-up) if the same muscles end up on back-to-back days, and finishing a day can suggest a better order for the days ahead (Back-to-back).'],
  ['Back-to-back', 'With Injury prevention on: when you finish a day, the app checks the days still ahead this week. A day counts as finished once its workout cards are ticked or skipped; the sled and Home cards don\'t need ticking. If the same exercise is on two days in a row, it suggests the smallest fix: moving your rest day, then moving one card to another day, then a new order for the days. Apply changes this week only, and Put back undoes it. Days you have started and empty days stay put. Home cards, either/or cards and an exercise that is on every day are ignored.'],
  ['Day date', 'Once you check something off on a day, its header shows the weekday and date the exercises were logged or checked off, for example Sunday 09/27. Check-offs made while viewing another week are dated to the first day of that week (Sunday), and a rest day shows the date you ticked it.'],
  ['Mode 1, 2, 3', 'How your two programs, A and B, take turns: Mode 1 · A only; Mode 2 · monthly (A and B by month); Mode 3 · 6 months each. Change it at the top of the Board or in Settings, Training.'],
  ['Goals', 'Body weight: a target on Progress, from the weight you save at the top of the Board each week. Lift weight goals: tap a lift on Progress. Exercise frequency: how many times a week you want to do an exercise, on Progress.'],
  ['Water goal', 'On Daily, Supplements. It follows your body weight unless you set a fixed amount; Hot day and Training add to it for the day.'],
  ['To get / At home', 'The two views of Groceries on the Daily tab. Untick an item under At home when you run out, and it shows up under To get.'],
];

export default function HelpSheet() {
  const closeModal = useAppStore(s => s.closeModal);
  return (
    <Sheet className="help">
      <h2 className="cond">Help</h2>
      <section aria-labelledby="help-start">
        <h3 id="help-start">Getting started</h3>
        <ol className="helpsteps">
          <li><b>Set up your week.</b> On an empty Board, pick a starter program (and how many days a week) or Build my own. Each day has <b>+ Add to program</b>; the Program tab edits the whole week.</li>
          <li><b>Train.</b> Tick an exercise when you have done it (on a phone, swipe it right; left skips it). Press <b>Log</b> to record the weight and reps of each set, or <b>Same as last</b> to repeat your last session.</li>
          <li><b>Watch the targets.</b> The weight on each card is a suggestion. It goes up when you complete all your sets two sessions in a row, and Progress shows how each lift is going.</li>
          <li><b>Try something new.</b> Saw an exercise on Instagram, TikTok or YouTube? Under the board, <b>+ Add experiment</b>, type its name and paste the post into <b>Video link</b>. Pick a day and <b>This week only</b> to try it; <b>To program</b> keeps it for good.</li>
          <li><b>Install it.</b> Settings, App on this device: add Iron Log to your home screen so it opens like an app and works without a connection at the gym.</li>
          <li><b>Something wrong or missing?</b> Settings, Send feedback: <b>Copy problem details</b> and <b>Open feedback form</b>. Iron Log is still early, so every report helps.</li>
        </ol>
      </section>
      <section aria-labelledby="help-how">
        <h3 id="help-how">Where things are</h3>
        <ol className="helpsteps">
          <li><b>Board.</b> Switch between <b>Workout</b> and <b>Stretches</b> at the top. In Workout, each day of your plan is a column; on a phone, use the day buttons (D1 to D7) or swipe across. A card’s <b>⋯</b> moves it to another day or skips it this week, and you can drag cards between days. <b>Experiments</b> sit under the days. Body weight for the week is at the top.</li>
          <li><b>Daily.</b> <b>Supplements</b> (your Morning, Noon and Night list and a water log), <b>Groceries</b> (what to get and what is at home, by store) and <b>Medical</b>, which has nothing in it yet. Edit changes the lists.</li>
          <li><b>Progress.</b> Sets and volume per week, weight change and personal bests per lift, body weight and goals, and every lift’s history. <b>Muscles</b>, the switch at the top, shows which muscles your plan trains.</li>
          <li><b>Program.</b> <b>Programs</b> edits A and B day by day and keeps a library of programs. <b>Exercise library</b> and <b>Stretch library</b> hold everything you use, with search and the catalog.</li>
          <li><b>Settings.</b> <b>Training</b> (program mode, phases, Injury prevention, 1RMs), <b>Data</b> (account, sync, export and import), <b>App</b> (appearance, rest timer alert, install, feedback) and <b>Erase &amp; delete</b>.</li>
        </ol>
      </section>
      <section aria-labelledby="help-words">
        <h3 id="help-words">Words and abbreviations</h3>
        <dl className="glossary">
          {GLOSSARY.filter(Boolean).map(([t, d]) => <div key={t}><dt>{t}</dt><dd>{d}</dd></div>)}
        </dl>
      </section>
      <div className="actions"><button type="button" className="btn" onClick={closeModal}>Close</button></div>
    </Sheet>
  );
}
