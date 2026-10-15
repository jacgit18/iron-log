import type { Stretch, StretchTier } from '../../types.ts';
import type { AppState } from '../../store/types.ts';
import { useState, type ReactNode } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { weekStartOf, ymd, addDays, fmtShort, DAY_NAMES } from '../../shared/dates.js';
import { videoLabel } from '../../lib/data.js';
import { groupsOf, dayTally, weekDaysDone, weekDaysCounted, isStretchDone, extrasOn, STRETCH_DAYS } from '../../lib/stretches.js';
import { motionOK } from '../../lib/motion.js';
import { useSwipeCard } from '../board/useSwipeCard.js';
import ArmedButton from '../ArmedButton.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import WarmUp from './WarmUp.jsx';
import StretchFirstRun from './StretchFirstRun.jsx';
import './Stretches.css';

const DAYS7 = Array.from({ length: STRETCH_DAYS }, (_, i) => i);

function Link({ n, url }: { n: string; url?: string }) {
  return url ? <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`${videoLabel(url)}: ${n} (opens in a new tab)`}><span aria-hidden="true">▶ </span>{videoLabel(url)}</a> : null;
}

function Row({ d, s, id, n, url, note, extra, removing }: { d: number; s: AppState; id: string; n: string; url?: string; note?: string; extra?: ReactNode; removing?: boolean }) {
  const week = useAppStore(x => x.strWeek);
  const done = isStretchDone(week, d, id);
  return (
    <div className={`ex strrow${done ? ' idone' : ''}${removing ? ' removing' : ''}`}>
      {removing && <span className="rmtag">Will be removed · tap Remove again</span>}
      <div className="exname">
        <input type="checkbox" className="chk" id={`schk-${d}-${id}`} checked={done} aria-label={`Mark ${n} done`} onChange={e => s.setStretchDone(d, id, e.target.checked)} />
        <span className="exh rmname">{n}</span>
        <Link n={n} url={url} />
        {extra}
      </div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

function GroupCard({ d, name, items, tier }: { d: number; name: string; items: Stretch[]; tier: StretchTier }) {
  const s = useAppStore.getState();
  const week = useAppStore(x => x.strWeek);
  const ids = items.map((i) => i.id); const all = ids.every((id) => isStretchDone(week, d, id));
  // Swipe right ticks the whole group, either way puts a done group back: the group checkbox's own action. No skip: that is per day.
  const sw = useSwipeCard({ state: all ? 'done' : 'open', canDone: true, canSkip: false, act: a => s.setStretchesDone(d, ids, a === 'done') });
  return (
    <article className={`card${all ? ' done' : ''}${sw.className}`} aria-label={`${name}, ${tier}`} {...sw.data} style={sw.style} {...sw.props}>
      <div className="row1 grphead">
        <input type="checkbox" className="chk" id={`sgrp-${d}-${tier}-${name}`} checked={all} aria-label={`Mark all of ${name} done`} onChange={e => s.setStretchesDone(d, ids, e.target.checked)} />
        <span className="tag">{name}</span>
        <span className="count" aria-hidden="true">{ids.filter((id) => isStretchDone(week, d, id)).length}/{ids.length}</span>
      </div>
      {items.map((i) => <Row key={i.id} d={d} s={s} id={i.id} n={i.n} url={i.url} note={i.note} />)}
    </article>
  );
}

function Experiments({ day }: { day: number }) {
  const items = useAppStore(x => x.stretchExps);
  const s = useAppStore.getState();
  const [pick, setPick] = useState<Record<string, number>>({});
  const [arming, setArming] = useState<string | null>(null); // the experiment whose Delete was pressed once
  return (
    <section className="experiments" aria-labelledby="sexp-h">
      <div className="exphead">
        <h2 id="sexp-h" className="cond" tabIndex={-1}>Experiments</h2>
        <button type="button" className="btn sm" id="sexp-add" onClick={() => s.openModal({ type: 'stretchexp' })}>+ Add stretch</button>
      </div>
      <RemovedNotice scope="stretchexps" />
      {!items.length ? <p className="note">Keep stretches you want to try here, then add them to a day.</p> : (
        <ul className="explist">
          {items.map(e => {
            const to = pick[e.id] ?? day;
            return (
              <li key={e.id} className={`expcard${arming === e.id ? ' removing' : ''}`}>
                {arming === e.id && <span className="rmtag">Will be deleted · tap Delete again</span>}
                <div><b className="rmname">{e.n}</b>{e.group && <> <span className="tag">{e.group}</span></>}</div>
                {e.note && <div className="note">{e.note}</div>}
                <Link n={e.n} url={e.url} />
                <div className="actions">
                  <label htmlFor={`sexp-to-${e.id}`}>Add to</label>
                  <select id={`sexp-to-${e.id}`} aria-label={`Add to (${e.n})`} value={to} onChange={ev => setPick(p => ({ ...p, [e.id]: Number(ev.target.value) }))}>
                    {DAYS7.map(d => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
                  </select>
                  <button type="button" className="btn sm" aria-label={`Add ${e.n} to ${DAY_NAMES[to]}`} onClick={() => s.addStretchToDay(e.id, to)}>Add</button>
                  <button type="button" className="btn sm ghost" aria-label={`Add ${e.n} to your stretches`} onClick={() => s.promoteStretchExp(e.id)}>To my stretches</button>
                  <button type="button" className="btn sm ghost" aria-label={`Edit ${e.n}`} onClick={() => s.openModal({ type: 'stretchexp', id: e.id })}>Edit</button>
                  <ArmedButton className={`btn sm ${arming === e.id ? 'danger' : 'ghost'}`} label="Delete" armedLabel="Tap again to delete" aria-label={`Delete ${e.n}`} onArmedChange={a => setArming(a ? e.id : null)} onConfirm={() => { setArming(null); s.deleteStretchExp(e.id); }} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function Stretches() {
  const items = useAppStore(x => x.stretches);
  const week = useAppStore(x => x.strWeek);
  const weekStart = useAppStore(x => x.weekStart);
  const today = useToday(x => x.today);
  const s = useAppStore.getState();
  const wk = ymd(weekStart);
  const thisWeek = ymd(weekStartOf(today)) === wk;
  const [pick, setPick] = useState<{ wk: string; d: number } | null>(null); // {wk, d}: the phone's day, only for the week it was picked in
  const day = pick && pick.wk === wk ? pick.d : thisWeek ? today.getDay() : 0;
  const choose = (d: number) => setPick({ wk, d });
  const [arming, setArming] = useState<string | null>(null); // the added stretch whose Remove was pressed once
  const primary = groupsOf(items, 'primary'); const secondary = groupsOf(items, 'secondary');
  const days = weekDaysDone(items, week);
  const counted = weekDaysCounted(week);
  const todayTally = thisWeek ? dayTally(items, week, today.getDay()) : null;
  const [dayMore, setDayMore] = useState<number | null>(null); // phones: the day whose Skip day button is showing
  const pct = counted ? Math.round(days / counted * 100) : 0;

  return (
    <div className="strroot">
      <div className="weekbar">
        <div className="weeknav">
          <button type="button" className="btn sm" aria-label="Previous week" onClick={() => s.gotoWeek('prev')}>‹</button>
          <h2 className="cond">{fmtShort(weekStart)} – {fmtShort(addDays(weekStart, 6))}</h2>
          <button type="button" className="btn sm" aria-label="Next week" onClick={() => s.gotoWeek('next')}>›</button>
          {!thisWeek && <button type="button" className="btn sm ghost" onClick={() => s.gotoWeek('today')}>This week</button>}
        </div>
        <div className="progress">
          <span role="status">{days} of {counted} days done{counted < STRETCH_DAYS ? ` · ${STRETCH_DAYS - counted} skipped` : ''}{todayTally && todayTally.total > 0 ? ` · Today ${todayTally.done} of ${todayTally.total}` : ''}</span>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
      {items.length === 0 && <StretchFirstRun />}

      <div className="daytabs" role="tablist" aria-label="Day" onKeyDown={e => {
        const n = { ArrowRight: day + 1, ArrowLeft: day - 1, Home: 0, End: STRETCH_DAYS - 1 }[e.key]; if (n == null) return;
        e.preventDefault(); const d = (n + STRETCH_DAYS) % STRETCH_DAYS; choose(d); document.getElementById(`sdaytab-${d}`)!.focus();
      }}>
        {DAYS7.map(d => {
          const t = dayTally(items, week, d); const short = t.skipped ? 'Skip' : t.full ? '✓' : `${t.done}/${t.total}`;
          return (
            <button type="button" role="tab" key={d} id={`sdaytab-${d}`} aria-selected={d === day} aria-controls={`scol-${d}`} tabIndex={d === day ? 0 : -1}
              className={t.full || t.skipped ? 'full' : ''} aria-label={`${DAY_NAMES[d].slice(0, 3)} ${short}: ${DAY_NAMES[d]}, ${t.skipped ? 'skipped' : t.full ? 'all done' : `${t.done} of ${t.total} done`}`}
              onClick={() => { choose(d); window.scrollTo({ top: 0, behavior: motionOK() ? 'auto' : 'instant' }); }}>
              <b aria-hidden="true">{DAY_NAMES[d].slice(0, 3)}</b>{' '}<span aria-hidden="true">{short}</span>
            </button>
          );
        })}
      </div>

      <div className="board">
        {DAYS7.map(d => {
          const t = dayTally(items, week, d); const date = addDays(weekStart, d);
          const extras = extrasOn(week, d);
          const allIds = [...items.filter(i => i.tier === 'primary').map(i => i.id), ...extras.map(x => x.id)];
          return (
            <section key={d} id={`scol-${d}`} aria-labelledby={`scolh-${d}`} className={`col${t.full || t.skipped ? ' complete' : ''}${t.skipped ? ' skipd' : ''}${d === day ? ' sel' : ''}${dayMore === d ? ' more' : ''}`}>
              <div className="colhead">
                <input type="checkbox" className="chk" id={`sday-${d}`} checked={t.full} disabled={!allIds.length || t.skipped} aria-label={`Mark all of ${DAY_NAMES[d]} done`} onChange={e => s.setStretchesDone(d, allIds, e.target.checked)} />
                <div>
                  <h3 id={`scolh-${d}`}>{DAY_NAMES[d]}</h3>
                  <div className="sub daydate">{String(date.getMonth() + 1).padStart(2, '0')}/{String(date.getDate()).padStart(2, '0')}</div>
                </div>
                <span className="count">{t.skipped ? 'Skipped' : `${t.done}/${t.total}`}</span>
                <button type="button" className="btn sm ghost daymore" id={`sdaymore-${d}`} aria-expanded={dayMore === d || !!t.skipped} aria-controls={`sskiprow-${d}`} aria-label={`More for ${DAY_NAMES[d]}: skip day`}
                  onClick={() => setDayMore(dayMore === d ? null : d)}><span aria-hidden="true">⋯</span></button>
              </div>
              <div className="addrow" id={`sskiprow-${d}`}>
                <button type="button" className="btn sm ghost" id={`sskip-${d}`} aria-pressed={!!t.skipped} aria-label={t.skipped ? `Undo skip for ${DAY_NAMES[d]}` : `Skip ${DAY_NAMES[d]}`} onClick={() => { s.skipStretchDay(d, !t.skipped); if (t.skipped && dayMore !== d) requestAnimationFrame(() => document.getElementById(`sdaymore-${d}`)?.focus()); }}>{t.skipped ? 'Undo skip' : 'Skip day'}</button>
              </div>
              <RemovedNotice scope={`sday:${wk}:${d}`} />
              {items.length > 0 && <WarmUp d={d} />}
              {t.skipped ? <p className="note">Skipped. It doesn’t count for or against this week.</p> : <>
              {!primary.length && !extras.length && <p className="note">No daily stretches yet. Add some in the Program tab.</p>}
              {primary.map(g => <GroupCard key={g.name} d={d} name={g.name} items={g.items} tier="primary" />)}
              {extras.length > 0 && (
                <article className="card">
                  <span className="tag">Added for this day</span>
                  {extras.map(x => <Row key={x.id} d={d} s={s} id={x.id} n={x.n} url={x.url} note={x.note} removing={arming === x.id}
                    extra={<ArmedButton className={`btn sm ${arming === x.id ? 'danger' : 'ghost'}`} aria-label={`Remove ${x.n} from ${DAY_NAMES[d]}`} label="Remove" armedLabel="Tap again to remove" onArmedChange={a => setArming(a ? x.id : null)} onConfirm={() => { setArming(null); s.removeStretchExtra(x.id); }} />} />)}
                </article>
              )}
              {secondary.length > 0 && <div className="sect">Once in a while</div>}
              {secondary.map(g => <GroupCard key={g.name} d={d} name={g.name} items={g.items} tier="secondary" />)}
              </>}
            </section>
          );
        })}
      </div>
      <Experiments day={day} />
    </div>
  );
}
