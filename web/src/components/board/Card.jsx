import { Fragment } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useTimerStore } from '../../store/useTimerStore.js';
import { PHASES, PH_KEYS, exInfo } from '../../lib/data.js';
import { parseDate, fmtShort } from '../../lib/dates.js';
import {
  isDone, isSkipped, isPaired, isItemDone, phaseOf, targetOf, lastLog, rxOf, stallOf, describe, holdPlan,
} from '../../lib/logic.js';

export default function Card({ s, curDay, onDragStart, onDragEnd, dragging }) {
  const cfg = useAppStore(st => st.cfg);
  const week = useAppStore(st => st.week);
  const logs = useAppStore(st => st.logs);
  const { checkCard, checkItem, setPhase, quickLog, openModal, moveSlot, skipCard } = useAppStore.getState();
  const startHold = useTimerStore(st => st.startHold);

  const done = isDone(s, week); const sk = isSkipped(s, week); const paired = isPaired(s);
  const label = s.type === 'superset' ? 'Superset' : s.type === 'either' ? 'Either / or' : '';
  const cur = week.moved[s.id] || s.day;

  return (
    <article
      className={`card${done ? ' done' : ''}${sk ? ' skipped' : ''}${dragging ? ' dragging' : ''}`}
      draggable="true"
      onDragStart={e => onDragStart(e, s.id)}
      onDragEnd={onDragEnd}
    >
      <div className="row1">
        {!paired && (
          <input type="checkbox" className="chk" id={`chk-${s.id}`} checked={done} aria-label="Mark done"
            onChange={e => checkCard(s.id, e.target.checked)} />
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {(label || s.tier) && <span className="tag">{[s.tier, label].filter(Boolean).join(' · ')}</span>}
          {s.day !== curDay && <span className="moved">From Day {s.day}</span>}
          {sk && <span className="skiptag">Skipped this week</span>}
        </div>
      </div>

      {s.items.map((it, idx) => {
        const ph = phaseOf(cfg, week, s, idx); const ex = exInfo(cfg, it.ex);
        const t = targetOf(cfg, logs, it, ph); const last = lastLog(logs, it.ex, ph);
        const idone = paired && isItemDone(s, idx, week);
        const rx = rxOf(cfg, it, ph);
        const st = stallOf(cfg, logs, it.ex, ph);
        const hp = ph === 'iso' ? holdPlan(cfg, week, logs, s, idx) : null;
        return (
          <Fragment key={idx}>
            {idx > 0 && s.type === 'either' && <div className="or">or</div>}
            <div className={`ex${idone ? ' idone' : ''}`}>
              <div className="exname">
                {paired && (
                  <input type="checkbox" className="chk" id={`chk-${s.id}-${idx}`} checked={idone} aria-label={`Mark ${ex.n} done`}
                    onChange={e => checkItem(s.id, idx, e.target.checked)} />
                )}
                {s.type === 'superset' ? (idx === 0 ? 'A · ' : 'B · ') : ''}{ex.n}
                {ex.url && <a href={ex.url} target="_blank" rel="noopener noreferrer" aria-label="Video">▶ video</a>}
              </div>
              <div className="exline">
                <select className="phase" data-p={ph || ''} aria-label="Phase" value={ph || ''}
                  onChange={e => setPhase(s.id, idx, e.target.value)}>
                  {!ph && <option value="">Set phase</option>}
                  {PH_KEYS.map(k => <option key={k} value={k}>{PHASES[k].label}</option>)}
                </select>
                {rx && <span className="rx">{rx}</span>}
                {t.w != null
                  ? <span className={`tw${t.up ? ' up' : ''}`}>{t.up ? '↑ ' : ''}{t.w} lb <small>{t.src}</small></span>
                  : t.src && <span className="rx">{t.src}</span>}
                {hp && <button type="button" className="btn sm" onClick={() => startHold(ex.n, hp.sets, hp.hold)}>Hold {hp.sets}×{hp.hold}s</button>}
                {last && <button type="button" className="btn sm" title={`Log ${describe(last)} again`} onClick={() => quickLog(s.id, idx)}>Same as last</button>}
                <button type="button" className="btn sm logbtn" onClick={() => openModal({ type: 'log', slotId: s.id, idx })}>Log</button>
              </div>
              {it.note && <div className="note">{it.note}</div>}
              {last && <div className="lastlog">Last: {describe(last)} · {fmtShort(parseDate(last.d))}</div>}
              {st && <div className="stall" tabIndex={0} data-tip={`No gain in weight or reps over your last 3 sessions since ${fmtShort(parseDate(st.since))}.`}>Stalled · no gain in 3 sessions</div>}
            </div>
          </Fragment>
        );
      })}

      {s.note && <div className="note">{s.note}</div>}
      <div className="cardfoot">
        <label htmlFor={`mv-${s.id}`}>Move to</label>
        <select id={`mv-${s.id}`} value={cur} onChange={e => moveSlot(s.id, Number(e.target.value))}>
          {[1, 2, 3, 4, 5, 6].map(d => <option key={d} value={d}>Day {d}{d === s.day ? ' (planned)' : ''}</option>)}
        </select>
        <button type="button" className="btn sm ghost skipbtn" aria-pressed={sk} onClick={() => skipCard(s.id)}>{sk ? 'Undo skip' : 'Skip'}</button>
      </div>
    </article>
  );
}
