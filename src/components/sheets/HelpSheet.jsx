import { useAppStore } from '../../store/useAppStore.js';
import Sheet from '../Sheet.jsx';
import { FEATURES } from '../../lib/features.js';

const GLOSSARY = [
  ['1RM (one-rep max)', 'The heaviest weight you can lift once with good form. Enter it and targets are worked out as a percentage of it.'],
  ['lb', 'Pounds, the unit for every weight in the app.'],
  ['Bodyweight', 'No added weight: the exercise uses your own body.'],
  ['Sets × reps', 'How much to do, for example 4 × 6 means 4 sets of 6 repetitions. For holds, 4 × 30 s means 4 holds of 30 seconds.'],
  ['Experiments', 'A list under the board of exercises you want to try. Add one to a day of this week and it shows as a normal card for that week only; Remove takes it off again. The list itself stays for later weeks.'],
  ['Add exercise', 'Each day has a + Add exercise button. It opens the add sheet where you pick Primary or Accessory, the section, and single, superset or either/or, and it joins that day of the program every week. Only this week adds a one-week card instead (Remove takes it off again).'],
  FEATURES.stretches && ['Stretch', 'An exercise marked as a stretch or mobility has no weight, reps or phase, only a checkbox, and isn’t counted toward muscles. Stretches are listed under the Warm-up on each day.'],
  ['Details', 'Each exercise card has a Details button for its video link, equipment and a default phase that applies to every card with that exercise.'],
  ['Filter', 'Above the days, filter the board by muscle (primary or secondary) or by equipment. It only hides cards; the counts stay the same.'],
  ['Phase', 'The goal of an exercise right now. Each phase has its own sets, reps and share of your 1RM. Mobility is for stretching and mobility work: it has sets and reps but no share of a 1RM.'],
  ['Strength', 'Heavy weight, few reps (about 85% of your 1RM).'],
  ['Isometric (ISO)', 'Holding still under load instead of moving, timed in seconds. The Hold button runs the timer.'],
  ['Hypertrophy', 'Moderate weight, more reps, to build muscle size (about 65% of your 1RM).'],
  ['Explosive', 'Light weight moved as fast as possible, for power (about 45% of your 1RM).'],
  ['Target', 'The weight suggested for today: from your 1RM, your last session, or the program.'],
  ['Stalled', 'Your last 3 sessions of a lift, over at least 2 weeks, didn’t go up in weight or reps.'],
  ['Superset (A → B)', 'Two exercises done back to back. Each has its own checkbox.'],
  ['Either / or', 'Do one of the two, whichever equipment is free. It counts once.'],
  ['Primary / Accessory', 'Main lifts of the day, and the smaller supporting exercises.'],
  ['Primary / secondary muscles', 'Muscles an exercise mainly works, and ones it works less. Secondary work counts as half a set on the Muscles tab.'],
  ['Mobility', 'Stretching or movement work. It isn’t counted toward any muscle.'],
  ['Warm-up', 'Short exercises before each day’s session.'],
  ['Make-up day', 'Day 5 is meant for anything you skipped earlier in the week. Use Move to put exercises there.'],
  ['Unchecked yesterday', 'When yesterday still has exercises with nothing checked, a notice at the top of the board offers to skip them all or move them all to a later day. Not now hides it until tomorrow.'],
  ['Skip', 'Leaves an exercise out of this week’s counts without deleting it.'],
  ['D1 to D7', 'Day 1 to Day 7 of the week’s plan.'],
  ['Rest day', 'Tick Rest day on a day to rest. Your workouts from that day on move one day later, and the rest day counts as done. Untick to undo. You can’t add one while Day 7 has exercises.'],
  ['Swap arrows', 'The ← and → on each day swap it with the day beside it for this week only. The workouts trade places and the day labels stay in order. Swapping with the rest day moves your rest day.'],
  ['Day date', 'Once you check something off on a day, its header shows the weekday and date the exercises were logged or checked off, for example Sunday 09/27. Check-offs made while viewing another week are dated to the first day of that week (Sunday), and a rest day shows the date you ticked it.'],
  ['Mode 1, 2, 3', 'How the two programs take turns: Program A only; A and B by month; or six months each.'],
];

export default function HelpSheet() {
  const closeModal = useAppStore(s => s.closeModal);
  return (
    <Sheet className="help">
      <h2 className="cond">Help</h2>
      <section aria-labelledby="help-how">
        <h3 id="help-how">How Iron Log works</h3>
        <ol className="helpsteps">
          <li><b>Board.</b> Each day of your plan is a column. Tick an exercise when you have done it. On a phone, use the day buttons (D1 to D7) to change days.</li>
          <li><b>Log.</b> Press Log on an exercise to record the weight and reps of each set. Same as last copies your previous session.</li>
          <li><b>Targets.</b> The weight shown on each exercise is a suggestion. It goes up when you complete all your sets two sessions in a row.</li>
          <li><b>Move or skip.</b> If equipment is busy, use Move to put an exercise on another day, or Skip to leave it out this week.</li>
          <li><b>Progress</b> shows your trends, <b>Muscles</b> shows which muscles your plan trains, <b>Program</b> lets you change the plan, and <b>Settings</b> holds your 1RMs, backups and display options.</li>
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
