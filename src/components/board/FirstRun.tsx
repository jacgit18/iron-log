import { useState } from 'react';
import { weekStartOf, ymd } from '../../shared/dates.js';
import { STARTERS, type Starter } from '../../lib/starterPrograms.js';
import { flag, useAppStore } from '../../store/useAppStore.js';
import './FirstRun.css';

// Shown when the board has no exercises at all: a brand-new account (ADR 016) or one that removed every card. It offers a starter
// program (ADR 041) or the same "+ Add to program" flow each day column has, so there is still only one way to add a single card.
function StarterRow({ starter }: { starter: Starter }) {
  const [days, setDays] = useState(starter.perWeek[0]!);
  const choices = [...starter.perWeek].sort((a, b) => a - b);
  const use = () => {
    const err = useAppStore.getState().applyStarter(starter.id, days);
    if (err) flag(err);
  };
  return (
    <li className="starter">
      <div className="starter-text">
        <strong>{starter.name}</strong>
        <span>{starter.blurb}</span>
      </div>
      <div className="starter-controls">
        {choices.length > 1 ? (
          <label>
            Days a week
            <select aria-label={`${starter.name} days a week`} value={days} onChange={e => setDays(Number(e.target.value))}>
              {choices.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        ) : <span className="note">{choices[0]} days a week</span>}
        <button type="button" className="btn" onClick={use} aria-label={`Use ${starter.name}, ${days} days a week`}>Use this</button>
      </div>
    </li>
  );
}

export default function FirstRun() {
  const st = useAppStore.getState();
  // Starters add cards that start this week, so they are offered only on this week's open board; elsewhere only Build my own.
  const canStart = useAppStore(s => s.weekKey() === ymd(weekStartOf(new Date())) && !s.shownFromRecord());
  return (
    <section className="notice firstrun" aria-labelledby="firstrun-h">
      <h3 id="firstrun-h">Build your first workout</h3>
      {canStart ? (
        <>
          <p>Your board is empty. Pick a starter and change anything later, or build your own from scratch. Starters have sets and reps but no weights: you type the weight at your first session.</p>
          <ul className="starters" aria-label="Starter programs">
            {STARTERS.map(s => <StarterRow key={s.id} starter={s} />)}
          </ul>
        </>
      ) : (
        <p>Your board is empty. Add the exercises you train, and the day you train each one. Starter programs are offered on this week&rsquo;s board.</p>
      )}
      <div className="actions">
        <button type="button" className="btn primary" id="firstrun-add" onClick={() => st.openAddToProgram(1)}>Build my own: add your first exercise</button>
      </div>
      <p className="note">Each day below has its own &ldquo;+ Add to program&rdquo; button, and the Program tab edits the whole week.</p>
      <p className="note">Saw an exercise online you want to try? Keep it under Experiments, below the days, with a link to the video. Help, at the top, explains the rest.</p>
    </section>
  );
}
