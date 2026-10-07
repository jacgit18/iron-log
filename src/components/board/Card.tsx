import type { FlatSlot } from '../../types.ts';
import { Fragment, type DragEvent } from 'react';
import type { PhaseKey } from '../../types.ts';
import { useAppStore } from '../../store/useAppStore.js';
import { useTimerStore } from '../../store/useTimerStore.js';
import { PHASES, PH_KEYS, EQUIPMENT, exInfo, videoLabel } from '../../lib/data.js';
import { parseDate, fmtShort } from '../../shared/dates.js';
import {
  DAYS, isTimed, colOf, isDone, isSkipped, isPaired, isItemDone, phaseOf, targetOf, lastLog, rxOf, stallOf, backoffOf, describe, holdPlan,
  restsOf,
} from '../../lib/logic.js';

export default function Card({ s, onDragStart, onDragEnd, dragging }: { s: FlatSlot; onDragStart: (e: DragEvent, id: string) => void; onDragEnd: () => void; dragging: boolean }) {
  const cfg = useAppStore(st => st.cfg);
  const week = useAppStore(st => st.week);
  const logs = useAppStore(st => st.logs);
  const { checkCard, checkItem, setPhase, quickLog, openModal, moveSlot, skipCard, removeExtra } = useAppStore.getState();
  const startHold = useTimerStore(st => st.startHold);

  const done = isDone(s, week); const sk = isSkipped(s, week); const paired = isPaired(s);
  const label = s.type === 'superset' ? 'Superset' : s.type === 'either' ? 'Either / or' : '';
  const cur = colOf(week, week.moved[s.id] || s.day);
  const planned = colOf(week, s.day); // where the card's home workout sits this week
  const names = s.items.map((i) => exInfo(cfg, i.ex).n);
  const cardName = s.type === 'superset' ? names.join(' → ') : s.type === 'either' ? names.join(' or ') : names[0];

  return (
    <article
      aria-labelledby={`h-${s.id}-0`}
      className={`card${done ? ' done' : ''}${sk ? ' skipped' : ''}${dragging ? ' dragging' : ''}`}
      draggable="true"
      onDragStart={e => onDragStart(e, s.id)}
      onDragEnd={onDragEnd}
    >
      <div className="row1">
        {!paired && (
          <input type="checkbox" className="chk" id={`chk-${s.id}`} checked={done} aria-label={`Mark ${cardName} done`}
            onChange={e => checkCard(s.id, e.target.checked)} />
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {(label || s.tier || s.experiment) && <span className="tag">{[s.experiment && (s.added ? 'Added' : 'Experiment'), s.tier, label].filter(Boolean).join(' · ')}</span>}
          {week.moved[s.id] && <span className="moved">From Day {planned}</span>}
          {sk && <span className="skiptag">Skipped this week</span>}
        </div>
      </div>

      {s.items.map((it, idx) => {
        const ex = exInfo(cfg, it.ex);
        const ph = phaseOf(cfg, week, s, idx);
        const t = targetOf(cfg, logs, it, ph); const last = lastLog(logs, it.ex, ph);
        const idone = paired && isItemDone(s, idx, week);
        const rx = rxOf(cfg, it, ph);
        const bo = backoffOf(cfg, logs, it, ph); const st = !bo && stallOf(cfg, logs, it.ex, ph);
        const hp = isTimed(ph) ? holdPlan(cfg, week, logs, s, idx) : null;
        return (
          <Fragment key={idx}>
            {idx > 0 && s.type === 'either' && <div className="or">or</div>}
            <div className={`ex${idone ? ' idone' : ''}${ex.eq && EQUIPMENT[ex.eq] ? ' haseq' : ''}`}>
              {ex.eq && EQUIPMENT[ex.eq] && <span className="tag exeq">{EQUIPMENT[ex.eq]}</span>}
              <div className="exname">
                {paired && (
                  <input type="checkbox" className="chk" id={`chk-${s.id}-${idx}`} checked={idone} aria-label={`Mark ${ex.n} done`}
                    onChange={e => checkItem(s.id, idx, e.target.checked)} />
                )}
                <h4 className="exh" id={`h-${s.id}-${idx}`}>{s.type === 'superset' ? (idx === 0 ? 'A · ' : 'B · ') : ''}{ex.n}</h4>
                {ex.url && <a href={ex.url} target="_blank" rel="noopener noreferrer" aria-label={`${videoLabel(ex.url)}: ${ex.n} (opens in a new tab)`}><span aria-hidden="true">▶ </span>{videoLabel(ex.url)}</a>}
                <button type="button" className="btn sm ghost" id={`det-${s.id}-${idx}`} aria-label={`Details: ${ex.n}`} onClick={() => openModal({ type: 'exercise', exId: it.ex })}>Details</button>
              </div>
              <div className="exline">
                <select className="phase" id={`ph-${s.id}-${idx}`} data-p={ph || ''} aria-label={`Phase for ${ex.n}`} value={ph || ''}
                  onChange={e => setPhase(s.id, idx, e.target.value as PhaseKey)}>
                  {!ph && <option value="">Set phase</option>}
                  {PH_KEYS.map(k => <option key={k} value={k}>{PHASES[k].label}</option>)}
                </select>
                {rx && <span className="rx">{rx}</span>}
                {t.w != null
                  ? <span className={`tw${t.up ? ' up' : ''}`}>{t.up ? '↑ ' : ''}{t.w} lb <small>{t.src}</small></span>
                  : t.src && <span className="rx">{t.src}</span>}
                {hp && <button type="button" className="btn sm" id={`hold-${s.id}-${idx}`} aria-label={`Hold ${hp.sets}×${hp.hold}s: ${ex.n}`} onClick={() => startHold(ex.n, hp.sets, hp.hold)}>Hold {hp.sets}×{hp.hold}s</button>}
                {last && <button type="button" className="btn sm" id={`rep-${s.id}-${idx}`} aria-label={`Same as last: log ${ex.n} again, ${describe(last)}`} onClick={() => quickLog(s.id, idx)}>Same as last</button>}
                <button type="button" className="btn sm logbtn" id={`log-${s.id}-${idx}`} aria-label={`Log ${ex.n}`} onClick={() => openModal({ type: 'log', slotId: s.id, idx })}>Log</button>
              </div>
              {it.note && <div className="note">{it.note}</div>}
              {last && <div className="lastlog">Last: {describe(last)} · {fmtShort(parseDate(last.d))}</div>}
              {bo && <div className="stall">Back off · {ph === 'iso' ? 'holds fell short' : 'reps fell short'} 2 sessions in a row. Try {bo.lo === bo.hi ? bo.lo : `${bo.lo}–${bo.hi}`} lb and rebuild</div>}
              {st && <div className="stall">Stalled since {fmtShort(parseDate(st.since))} · no gain in 3 weeks. Check sleep and recovery before pushing harder</div>}
            </div>
          </Fragment>
        );
      })}

      {s.note && <div className="note">{s.note}</div>}
      <div className="cardfoot">
        <label htmlFor={`mv-${s.id}`}>Move to</label>
        <select id={`mv-${s.id}`} aria-label={`Move to (${cardName})`} value={cur} onChange={e => moveSlot(s.id, Number(e.target.value))}>
          {DAYS.map(d => <option key={d} value={d} disabled={restsOf(week).includes(d)}>Day {d}{restsOf(week).includes(d) ? ' (rest)' : d === planned ? ' (planned)' : ''}</option>)}
        </select>
        <button type="button" className="btn sm ghost skipbtn" id={`skip-${s.id}`} aria-label={sk ? `Undo skip for ${cardName}` : `Skip ${cardName} this week`} onClick={() => skipCard(s.id)}>{sk ? 'Undo skip' : 'Skip'}</button>
        {s.experiment && <button type="button" className="btn sm ghost" id={`rm-${s.id}`} aria-label={`Remove ${cardName} from this week`} onClick={() => { removeExtra(s.id); if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => document.getElementById(`colh-${cur}`)?.focus()); }}>Remove</button>}
      </div>
    </article>
  );
}
