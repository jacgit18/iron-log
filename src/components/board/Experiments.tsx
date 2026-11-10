import { useState, type DragEvent } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { exInfo } from '../../lib/data.js';
import { lastSession } from '../../lib/logic.js';
import { shownNote } from '../../lib/exerciseNote.js';
import { daysOn } from '../../lib/ideaDays.js';
import type { MuscleKey } from '../../types.ts';
import { M_KEYS, MUSCLES, tagsOf } from '../../lib/muscles.js';
import { hasFilter, matchesMuscle, matchesQuery, cardMuscles, matchesStatus, muscleKeys, musclesPresent, statusLabel, type IdeaStatus } from '../../lib/experimentFilter.js';
import IdeaCard from './IdeaCard.jsx';
import IdeaFilters from './IdeaFilters.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import './Experiments.css';

// The Experiment board: exercises to try, added to a day of the viewed week (Add opens the day sheet). Long lists get a search and Status and Muscle filters.
export default function Experiments({ onDragStart, onDragEnd }: { onDragStart: (e: DragEvent, id: string) => void; onDragEnd: () => void }) {
  const cfg = useAppStore(s => s.cfg);
  const items = useAppStore(s => s.experiments);
  const logs = useAppStore(s => s.logs);
  const week = useAppStore(s => s.week);
  const st = useAppStore.getState();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<IdeaStatus>('');
  const [muscle, setMuscle] = useState('');
  if (!hasFilter(items.length) && (q || status || muscle)) { setQ(''); setStatus(''); setMuscle(''); } // the filters hide on a short list: forget them, so they do not come back set
  const facts = items.map(e => ({ e, onDays: daysOn(week, e.ex), neverLogged: !lastSession(logs, e.ex), tags: tagsOf(cfg, e.ex) })).map(f => ({ ...f, mus: muscleKeys(f.tags) })); // lastSession ignores auto entries, so only a session you logged counts
  const shown = hasFilter(items.length) ? facts.filter(f => matchesStatus(status, f) && matchesMuscle(muscle, f.mus) && matchesQuery(q, exInfo(cfg, f.e.ex).n, shownNote(cfg, f.e.ex, f.e.note))) : facts;
  const muscles = musclesPresent(facts.map(f => f.mus), M_KEYS).map(key => ({ key, label: MUSCLES[key].n }));
  return (
    <section className="experiments" aria-labelledby="exp-h">
      <div className="exphead">
        <h2 id="exp-h" className="cond" tabIndex={-1}>Ideas to try</h2>
        <button type="button" className="btn sm" onClick={() => st.openModal({ type: 'experiment' })}>+ Add idea</button>
      </div>
      <RemovedNotice scope="experiments" />
      {hasFilter(items.length) && <IdeaFilters q={q} onQ={setQ} status={status} onStatus={setStatus} muscle={muscle} onMuscle={setMuscle} muscles={muscles} shown={shown.length} total={items.length} />}
      {!items.length ? <p className="note">Exercises you saw somewhere and want to test. Keep them here, then add them to a day.</p> : !shown.length ? <p className="note">No idea matches. Clear the filters.</p> : (
        <ul className="explist">
          {shown.map(f => {
            const info = exInfo(cfg, f.e.ex);
            return (
              <IdeaCard key={f.e.id} id={f.e.id} name={info.n} status={statusLabel(f)} muscles={cardMuscles(f.tags).map(m => MUSCLES[m as MuscleKey]?.n || m)} note={shownNote(cfg, f.e.ex, f.e.note)} url={info.url || undefined}
                onAdd={() => st.openModal({ type: 'ideaadd', id: f.e.id })} onEdit={() => st.openModal({ type: 'experiment', id: f.e.id })} onDelete={() => st.deleteExperiment(f.e.id)}
                drag={{ onStart: ev => onDragStart(ev, 'exp:' + f.e.id), onEnd: onDragEnd }} />
            );
          })}
        </ul>
      )}
    </section>
  );
}
