import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { monday, ymd, addDays, fmtShort, parseDate, DAY_NAMES } from '../../lib/dates.js';
import { videoLabel } from '../../lib/data.js';
import { groupsOf, dayTally, weekDaysDone, weekDaysCounted, isStretchDone, extrasOn, STRETCH_DAYS } from '../../lib/stretches.js';
import { motionOK } from '../../lib/motion.js';
import ArmedButton from '../ArmedButton.jsx';

const DAYS7 = Array.from({ length: STRETCH_DAYS }, (_, i) => i);

function Link({ n, url }) {
  return url ? <a href={url} target="_blank" rel="noopener noreferrer" aria-label={`${videoLabel(url)}: ${n} (opens in a new tab)`}><span aria-hidden="true">▶ </span>{videoLabel(url)}</a> : null;
}

function Row({ d, s, id, n, url, note, extra }) {
  const week = useAppStore(x => x.strWeek);
  const done = isStretchDone(week, d, id);
  return (
    <div className={`ex${done ? ' idone' : ''}`}>
      <div className="exname">
        <input type="checkbox" className="chk" id={`schk-${d}-${id}`} checked={done} aria-label={`Mark ${n} done`} onChange={e => s.setStretchDone(d, id, e.target.checked)} />
        <span className="exh">{n}</span>
        <Link n={n} url={url} />
        {extra}
      </div>
      {note && <div className="note">{note}</div>}
    </div>
  );
}

function GroupCard({ d, name, items, tier }) {
  const s = useAppStore.getState();
  const week = useAppStore(x => x.strWeek);
  const ids = items.map(i => i.id); const all = ids.every(id => isStretchDone(week, d, id));
  return (
    <article className={`card${all ? ' done' : ''}`} aria-label={`${name}, ${tier}`}>
      <div className="row1">
        <input type="checkbox" className="chk" id={`sgrp-${d}-${tier}-${name}`} checked={all} aria-label={`Mark all of ${name} done`} onChange={e => s.setStretchesDone(d, ids, e.target.checked)} />
        <span className="tag" style={{ alignSelf: 'center' }}>{name}</span>
      </div>
      {items.map(i => <Row key={i.id} d={d} s={s} id={i.id} n={i.n} url={i.url} note={i.note} />)}
    </article>
  );
}

function Summary({ items, week, today, wk }) {
  const thisWeek = ymd(monday(today)) === wk;
  const t = thisWeek ? dayTally(items, week, today.getDay()) : null;
  const days = weekDaysDone(items, week);
  return (
    <div className="bwrow" role="status">
      <span className="bwl">{thisWeek ? 'Stretching this week' : 'Stretching, week of ' + fmtShort(parseDate(wk))}</span>
      <b>{days} of {weekDaysCounted(week)} days complete</b>
      {t && t.total > 0 && <span className="note">Today {t.done} of {t.total}</span>}
    </div>
  );
}

function Experiments({ day }) {
  const items = useAppStore(x => x.stretchExps);
  const s = useAppStore.getState();
  const [pick, setPick] = useState({});
  return (
    <section className="experiments" aria-labelledby="sexp-h">
      <div className="exphead">
        <h2 id="sexp-h" className="cond" tabIndex={-1}>Experiments</h2>
        <button type="button" className="btn sm" id="sexp-add" onClick={() => s.openModal({ type: 'stretchexp' })}>+ Add stretch</button>
      </div>
      {!items.length ? <p className="note">Keep stretches you want to try here, then add them to a day.</p> : (
        <ul className="explist">
          {items.map(e => {
            const to = pick[e.id] ?? day;
            return (
              <li key={e.id} className="expcard">
                <div><b>{e.n}</b></div>
                {e.note && <div className="note">{e.note}</div>}
                <Link n={e.n} url={e.url} />
                <div className="actions">
                  <label htmlFor={`sexp-to-${e.id}`}>Add to</label>
                  <select id={`sexp-to-${e.id}`} aria-label={`Add to (${e.n})`} value={to} onChange={ev => setPick(p => ({ ...p, [e.id]: Number(ev.target.value) }))}>
                    {DAYS7.map(d => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}
                  </select>
                  <button type="button" className="btn sm" aria-label={`Add ${e.n} to ${DAY_NAMES[to]}`} onClick={() => s.addStretchToDay(e.id, to)}>Add</button>
                  <button type="button" className="btn sm ghost" aria-label={`Edit ${e.n}`} onClick={() => s.openModal({ type: 'stretchexp', id: e.id })}>Edit</button>
                  <ArmedButton className="btn sm ghost" label="Delete" armedLabel="Confirm delete" aria-label={`Delete ${e.n}`} onConfirm={() => { s.deleteStretchExp(e.id); if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => document.getElementById('sexp-h')?.focus()); }} />
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
  const thisWeek = ymd(monday(today)) === wk;
  const [pick, setPick] = useState(null); // {wk, d}: the phone's day, only for the week it was picked in
  const day = pick && pick.wk === wk ? pick.d : thisWeek ? today.getDay() : 0;
  const choose = d => setPick({ wk, d });
  const primary = groupsOf(items, 'primary'); const secondary = groupsOf(items, 'secondary');
  const days = weekDaysDone(items, week);
  const counted = weekDaysCounted(week);
  const pct = counted ? Math.round(days / counted * 100) : 0;

  return (
    <div>
      <div className="weekbar">
        <div className="weeknav">
          <button type="button" className="btn sm" aria-label="Previous week" onClick={() => s.gotoWeek('prev')}>‹</button>
          <h2 className="cond">{fmtShort(weekStart)} – {fmtShort(addDays(weekStart, 6))}</h2>
          <button type="button" className="btn sm" aria-label="Next week" onClick={() => s.gotoWeek('next')}>›</button>
          {!thisWeek && <button type="button" className="btn sm ghost" onClick={() => s.gotoWeek('today')}>This week</button>}
        </div>
        <div className="progress">
          <span>{days} of {counted} days done{counted < STRETCH_DAYS ? ` · ${STRETCH_DAYS - counted} skipped` : ''}</span>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        </div>
      </div>
      <Summary items={items} week={week} today={today} wk={wk} />

      <div className="daytabs" role="tablist" aria-label="Day" onKeyDown={e => {
        const n = { ArrowRight: day + 1, ArrowLeft: day - 1, Home: 0, End: STRETCH_DAYS - 1 }[e.key]; if (n == null) return;
        e.preventDefault(); const d = (n + STRETCH_DAYS) % STRETCH_DAYS; choose(d); document.getElementById(`sdaytab-${d}`).focus();
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
            <section key={d} id={`scol-${d}`} aria-labelledby={`scolh-${d}`} className={`col${t.full || t.skipped ? ' complete' : ''}${d === day ? ' sel' : ''}`}>
              <div className="colhead">
                <input type="checkbox" className="chk" id={`sday-${d}`} checked={t.full} disabled={!allIds.length || t.skipped} aria-label={`Mark all of ${DAY_NAMES[d]} done`} onChange={e => s.setStretchesDone(d, allIds, e.target.checked)} />
                <div>
                  <h3 id={`scolh-${d}`}>{DAY_NAMES[d]}</h3>
                  <div className="sub daydate">{String(date.getMonth() + 1).padStart(2, '0')}/{String(date.getDate()).padStart(2, '0')}</div>
                </div>
                <span className="count">{t.skipped ? 'Skipped' : `${t.done}/${t.total}`}</span>
              </div>
              <div className="addrow">
                <button type="button" className="btn sm ghost" id={`sskip-${d}`} aria-pressed={!!t.skipped} aria-label={t.skipped ? `Undo skip for ${DAY_NAMES[d]}` : `Skip ${DAY_NAMES[d]}`} onClick={() => s.skipStretchDay(d, !t.skipped)}>{t.skipped ? 'Undo skip' : 'Skip day'}</button>
              </div>
              {t.skipped ? <p className="note">Skipped. It doesn’t count for or against this week.</p> : <>
              {!primary.length && !extras.length && <p className="note">No daily stretches yet. Add some in the Program tab.</p>}
              {primary.map(g => <GroupCard key={g.name} d={d} name={g.name} items={g.items} tier="primary" />)}
              {extras.length > 0 && (
                <article className="card">
                  <span className="tag">Added for this day</span>
                  {extras.map(x => <Row key={x.id} d={d} s={s} id={x.id} n={x.n} url={x.url} note={x.note}
                    extra={<button type="button" className="btn sm ghost" aria-label={`Remove ${x.n} from ${DAY_NAMES[d]}`} onClick={() => s.removeStretchExtra(x.id)}>Remove</button>} />)}
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
