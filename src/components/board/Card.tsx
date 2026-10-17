import type { FlatSlot } from '../../types.ts';
import { Fragment, memo, useRef, useState, type DragEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { PhaseKey } from '../../types.ts';
import { useAppStore } from '../../store/useAppStore.js';
import type { AppState } from '../../store/types.ts';
import { cardWeek, cardLogs, type CardWeek } from '../../lib/cardView.js';
import { useTimerStore } from '../../store/useTimerStore.js';
import { PHASES, PH_KEYS, exInfo, videoLabel } from '../../lib/data.js';
import { eqName } from '../../lib/equipment.js';
import { parseDate, fmtShort } from '../../shared/dates.js';
import ArmedButton from '../ArmedButton.jsx';
import Icon from '../Icon.jsx';
import { useSwipeCard } from './useSwipeCard.js';
import type { CardState, SwipeAction } from '../../lib/swipe.js';
import './Card.css';
import {
  DAYS, isTimed, colOf, isDone, isSkipped, isPaired, isItemDone, isItemSkipped, phaseOf, targetOf, lastLog, rxOf, stallOf, backoffOf, describe, holdPlan,
  restsOf,
} from '../../lib/logic.js';

// The week saves as a fresh copy (mutateWeek clones it), so its slice is compared by value: the same object back while it reads the same.
function useCardWeek(s: FlatSlot): CardWeek {
  const last = useRef<{ key: string; week: CardWeek } | null>(null);
  return useAppStore(st => {
    const week = cardWeek(st.week, s); const key = JSON.stringify(week);
    if (last.current?.key === key) return last.current.week;
    last.current = { key, week };
    return week;
  });
}

// One exercise of a paired (superset, either/or) card, drawn as its own card inside the group border. Swipe it right to tick or untick
// that exercise, left to skip it (the card is skipped once every one is). Single cards use a plain box: no swipe hook is mounted for them.
type ItemSwipe = { state: CardState; act: (a: SwipeAction) => void };
function SwipeBox({ swipe, className, labelledBy, children }: { swipe: ItemSwipe; className: string; labelledBy: string; children: ReactNode }) {
  const sw = useSwipeCard({ state: swipe.state, canDone: true, act: swipe.act });
  return <div role="group" aria-labelledby={labelledBy} className={`${className} excard${sw.className}`} {...sw.data} style={sw.style} {...sw.props}>{children}</div>;
}
function ItemBox({ swipe, className, labelledBy, children }: { swipe: ItemSwipe | null; className: string; labelledBy: string; children: ReactNode }) {
  return swipe ? <SwipeBox swipe={swipe} className={className} labelledBy={labelledBy}>{children}</SwipeBox> : <div className={className}>{children}</div>;
}

type CardProps = { s: FlatSlot; onDragStart: (e: DragEvent, id: string) => void; onDragEnd: () => void; dragging: boolean };

function Card({ s, onDragStart, onDragEnd, dragging }: CardProps) {
  const cfg = useAppStore(st => st.cfg);
  // Only this card's part of the week and logs (lib/cardView.ts), so a tick on another card does not redraw this one.
  const week = useCardWeek(s);
  const logs = useAppStore(useShallow((st: AppState) => cardLogs(st.logs, s)));
  const { checkCard, checkItem, setPhase, quickLog, openModal, moveSlot, skipCard, skipItem, removeExtra } = useAppStore.getState();
  const startHold = useTimerStore(st => st.startHold);
  const [removing, setRemoving] = useState(false); // an experiment card's Remove was pressed once
  const [more, setMore] = useState(false); // the card's less-used actions (Move to, Skip, Remove) are folded behind the ⋯ button
  const moreBtn = useRef<HTMLButtonElement>(null);
  const foldOnEscape = (e: KeyboardEvent) => { if (e.key === 'Escape' && (more || removing)) { e.stopPropagation(); setMore(false); setRemoving(false); moreBtn.current?.focus(); } };
  // Skip and Undo skip swap which button is on the card, so the one that had focus goes away: hand focus to the new one.
  const focusById = (id: string) => { if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => document.getElementById(id)?.focus()); };
  const focusMore = () => focusById(`more-${s.id}`);
  const focusSkipped = () => focusById(`skip-${s.id}`);
  const moreOpen = more || removing; // armed Remove keeps its panel open so the second tap has somewhere to land

  const done = isDone(s, week); const sk = isSkipped(s, week); const paired = isPaired(s);
  const label = s.type === 'superset' ? 'Superset' : s.type === 'either' ? 'Either / or' : '';
  const cur = colOf(week, week.moved[s.id] || s.day);
  const planned = colOf(week, s.day); // where the card's home workout sits this week
  const names = s.items.map((i) => exInfo(cfg, i.ex).n);
  const cardName = s.type === 'superset' ? names.join(' → ') : s.type === 'either' ? names.join(' or ') : names[0];

  // Swipe right to tick off, left to skip, either way to put a done or skipped card back: the checkbox's and Skip button's own actions,
  // so the same announcements and notices. Cards ticked per exercise (paired) only swipe to skip or back.
  const sw = useSwipeCard({
    state: sk ? 'skipped' : done ? 'done' : 'open', canDone: !paired,
    act: a => (a === 'done' ? checkCard(s.id, true) : a === 'skip' || sk ? skipCard(s.id) : checkCard(s.id, false)),
  });

  return (
    <article
      {...(paired ? { 'aria-label': cardName } : { 'aria-labelledby': `h-${s.id}-0` })}
      className={`card${paired ? ' group' : ''}${done ? ' done' : ''}${sk ? ' skipped' : ''}${dragging ? ' dragging' : ''}${removing ? ' removing' : ''}${sw.className}`}
      {...sw.data}
      style={sw.style}
      {...sw.props}
      draggable="true"
      onDragStart={e => onDragStart(e, s.id)}
      onDragEnd={onDragEnd}
    >
      {removing && <span className="rmtag">Will be removed from this week · tap Remove again</span>}
      <div className="row1">
        <div className="cardmain">
          {(label || s.tier || s.experiment) && <span className="tag">{[s.experiment && (s.added ? 'Added' : 'Experiment'), s.tier, label].filter(Boolean).join(' · ')}</span>}
          {week.moved[s.id] && <span className="moved">From Day {planned}</span>}
          {sk && <span className="skiptag">Skipped this week</span>}
        </div>
        {sk && <button type="button" className="btn sm ghost" id={`skip-${s.id}`} aria-label={`Undo skip for ${cardName}`} onClick={() => { skipCard(s.id); focusMore(); }}>Undo skip</button>}
        <button type="button" className="btn sm ghost morebtn" ref={moreBtn} id={`more-${s.id}`} aria-expanded={moreOpen} aria-controls={`morepanel-${s.id}`}
          aria-label={`More actions: ${cardName}`} onClick={() => { if (moreOpen) { setMore(false); setRemoving(false); } else setMore(true); }} onKeyDown={foldOnEscape}><Icon name="dots" /></button>
      </div>
      {moreOpen && (
        <div className="cardfoot cardmore" id={`morepanel-${s.id}`} role="group" aria-label={`More actions: ${cardName}`}
          onKeyDown={foldOnEscape}>
          <label htmlFor={`mv-${s.id}`}>Move to</label>
          <select id={`mv-${s.id}`} aria-label={`Move to (${cardName})`} value={cur} onChange={e => moveSlot(s.id, Number(e.target.value))}>
            {DAYS.map(d => <option key={d} value={d} disabled={restsOf(week).includes(d)}>Day {d}{restsOf(week).includes(d) ? ' (rest)' : d === planned ? ' (planned)' : ''}</option>)}
          </select>
          {!sk && <button type="button" className="btn sm ghost skipbtn" id={`skip-${s.id}`} aria-label={`Skip ${cardName} this week`} onClick={() => { skipCard(s.id); setMore(false); focusSkipped(); }}>{paired ? (s.items.length === 2 ? 'Skip both' : 'Skip all') : 'Skip'}</button>}
          {!sk && paired && s.items.map((it, idx) => !isItemSkipped(s, idx, week) && (
            <button key={idx} type="button" className="btn sm ghost skipbtn" id={`skipi-${s.id}-${idx}`} aria-label={`Skip ${exInfo(cfg, it.ex).n} this week`} onClick={() => { skipItem(s.id, idx); setMore(false); focusMore(); }}>Skip {exInfo(cfg, it.ex).n}</button>
          ))}
          {s.experiment && <ArmedButton className={`btn sm ${removing ? 'danger' : 'ghost'}`} id={`rm-${s.id}`} aria-label={`Remove ${cardName} from this week`} label="Remove" armedLabel="Tap again to remove" onArmedChange={setRemoving} onConfirm={() => removeExtra(s.id)} />}
        </div>
      )}

      {s.items.map((it, idx) => {
        const ex = exInfo(cfg, it.ex);
        const ph = phaseOf(cfg, week, s, idx);
        const t = targetOf(cfg, logs, it, ph); const last = lastLog(logs, it.ex, ph);
        const idone = paired && isItemDone(s, idx, week);
        const isk = isItemSkipped(s, idx, week); // this exercise skipped on its own (superset)
        const rx = rxOf(cfg, it, ph);
        const bo = backoffOf(cfg, logs, it, ph); const st = !bo && stallOf(cfg, logs, it.ex, ph);
        const hp = isTimed(ph) ? holdPlan(cfg, week, logs, s, idx) : null;
        return (
          <Fragment key={idx}>
            {idx > 0 && s.type === 'either' && <div className="or">or</div>}
            <ItemBox labelledBy={`h-${s.id}-${idx}`} className={`ex${idone ? ' idone' : ''}${isk ? ' iskipped' : ''}${ex.eq && eqName(cfg, ex.eq) ? ' haseq' : ''}`}
              swipe={paired ? {
                state: sk || isk ? 'skipped' : idone ? 'done' : 'open',
                // Right ticks this exercise, left skips it (a superset exercise or an either/or option on its own; the card is skipped once every
                // one is); either way on a ticked or skipped one puts it back.
                act: a => (a === 'done' ? checkItem(s.id, idx, true) : a === 'skip' ? skipItem(s.id, idx) : isk ? skipItem(s.id, idx) : sk ? skipCard(s.id) : checkItem(s.id, idx, false)),
              } : null}>
              {ex.eq && eqName(cfg, ex.eq) && <span className="tag exeq">{eqName(cfg, ex.eq)}</span>}
              <div className="exname">
                {paired ? (
                  <input type="checkbox" className="chk" id={`chk-${s.id}-${idx}`} checked={idone} aria-label={`Mark ${ex.n} done`}
                    onChange={e => checkItem(s.id, idx, e.target.checked)} />
                ) : idx === 0 && (
                  <input type="checkbox" className="chk cardchk" id={`chk-${s.id}`} checked={done} aria-label={`Mark ${cardName} done`}
                    onChange={e => checkCard(s.id, e.target.checked)} />
                )}
                <div className="exlabel">
                  <h4 className="exh" id={`h-${s.id}-${idx}`}>{ex.n}</h4>
                  {ex.url && <a href={ex.url} target="_blank" rel="noopener noreferrer" aria-label={`${videoLabel(ex.url)}: ${ex.n} (opens in a new tab)`}><Icon name="play" />{' '}{videoLabel(ex.url)}</a>}
                </div>
              </div>
              {isk && <div className="iskiprow"><span className="skiptag">Skipped this week</span><button type="button" className="btn sm ghost" id={`undoskip-${s.id}-${idx}`} aria-label={`Undo skip for ${ex.n}`} onClick={() => skipItem(s.id, idx)}>Undo skip</button></div>}
              <div className="exline">
                <select className="phase" id={`ph-${s.id}-${idx}`} data-p={ph || ''} aria-label={`Phase for ${ex.n}, this week only`} value={ph || ''}
                  onChange={e => setPhase(s.id, idx, e.target.value as PhaseKey)}>
                  {!ph && <option value="">Set phase</option>}
                  {PH_KEYS.map(k => <option key={k} value={k}>{PHASES[k].label}</option>)}
                </select>
                {rx && <span className="rx">{rx}</span>}
                {t.w != null
                  ? <span className={`tw${t.up ? ' up' : ''}`}>{t.up ? '↑ ' : ''}{t.w} lb <small>{t.src}</small></span>
                  : t.src && <span className="rx">{t.src}</span>}
                {hp && !isk && !sk && <button type="button" className="btn sm" id={`hold-${s.id}-${idx}`} aria-label={`Hold ${hp.sets}×${hp.hold}s: ${ex.n}`} onClick={() => startHold(ex.n, hp.sets, hp.hold)}>Hold {hp.sets}×{hp.hold}s</button>}
                {last && !isk && !sk && <button type="button" className="btn sm" id={`rep-${s.id}-${idx}`} aria-label={`Same as last: log ${ex.n} again, ${describe(last)}`} onClick={() => quickLog(s.id, idx)}>Same as last</button>}
                {!isk && !sk && <button type="button" className="btn sm logbtn" id={`log-${s.id}-${idx}`} aria-label={`Log ${ex.n}`} onClick={() => openModal({ type: 'log', slotId: s.id, idx })}>Log</button>}
              </div>
              {it.note && <div className="note">{it.note}</div>}
              {last && <div className="lastlog">Last: {describe(last)} · {fmtShort(parseDate(last.d))}</div>}
              {bo && <div className="stall">Back off · {ph === 'iso' ? 'holds fell short' : 'reps fell short'} 2 sessions in a row. Try {bo.lo === bo.hi ? bo.lo : `${bo.lo}–${bo.hi}`} lb and rebuild</div>}
              {st && <div className="stall">Stalled since {fmtShort(parseDate(st.since))} · no gain in 3 weeks. Check sleep and recovery before pushing harder</div>}
            </ItemBox>
          </Fragment>
        );
      })}

      {s.note && <div className="note">{s.note}</div>}
    </article>
  );
}

// The board builds its card objects afresh on every draw (slotsFor), so `s` is compared by value. With the store slices above,
// a card is redrawn only when its own card, week keys, logs, the config or its drag state change.
const sameProps = (a: CardProps, b: CardProps) =>
  a.dragging === b.dragging && a.onDragStart === b.onDragStart && a.onDragEnd === b.onDragEnd && (a.s === b.s || JSON.stringify(a.s) === JSON.stringify(b.s));

export default memo(Card, sameProps);
