import type { FlatSlot } from '../../types.ts';
import { Fragment, useCallback, useRef, useState, type DragEvent, type TouchEvent } from 'react';
import type { MuscleKey } from '../../types.ts';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { exInfo } from '../../lib/data.js';
import { eqOptions } from '../../lib/equipment.js';
import { MUSCLES, M_KEYS, matchesFilter, muscleRank } from '../../lib/muscles.js';
import { weekStartOf, ymd, addDays, fmtShort, fmtDayDate } from '../../shared/dates.js';
import { restsOf, weekSlots, tally, currentLayout, isOpen, isSkipped, progName, DAYS, dayAt, dayTitle, dayDate, todayCol, leftovers, moveTargets, onlyElsewhere } from '../../lib/logic.js';
import { LS } from '../../lib/storage.js';
import { motionOK } from '../../lib/motion.js';
import Card from './Card.jsx';
import BodyWeightRow from './BodyWeightRow.jsx';
import Experiments from './Experiments.jsx';
import FirstRun from './FirstRun.jsx';
import InjurySwitch from './InjurySwitch.jsx';
import './BoardTop.css';
import './DayHeader.css';
import './Leftovers.css';

// Cards moved in from another day are grouped under their own heading.
const secOf = (s: FlatSlot, day: number) => (s.day === day ? s.sec : 'Moved here');
const tipHidden = (k: string) => LS.get(k) === 1; // stored as the string "1", same as the vanilla app

// "↔ from Day N" tab on the top edge of a day that just swapped; it floats, so no card moves when it comes or goes.
const swapFrom = (swapFlash: number[] | null, d: number) => swapFlash?.includes(d) ? <div className="swapfrom">↔ from Day {swapFlash[0] === d ? swapFlash[1] : swapFlash[0]}</div> : null;

// Left/right arrows that swap a column with its neighbor. Focus follows the workout to its new column.
// The date line under a day's title, "Sunday" over "09/27". The room for the longest one ("Wednesday" over "00/00") is always held (the hidden pad), so
// stamping a date changes no width or height in the header: the Rest box and the swap arrows stay where they were.
function DayDate({ date }: { date?: string | null }) {
  const [name, md] = date ? fmtDayDate(date).split(' ') : [];
  return (
    <div className="sub daydate">
      <span className="dd-pad" aria-hidden="true"><span>Wednesday</span><span>00/00</span></span>
      {date && <span className="dd-text"><span>{name}</span><span>{md}</span></span>}
    </div>
  );
}

function SwapArrows({ d }: { d: number }) {
  const rest = useAppStore(s => s.week.rest) || [];
  const swap = (dir: number) => {
    if (!useAppStore.getState().swapDays(d, dir)) return;
    const e = d + dir;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => {
      (document.getElementById(`swap-${e}-${dir}`) || document.getElementById(`swap-${e}-${-dir}`))?.focus();
      document.getElementById(`col-${e}`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: motionOK() ? 'smooth' : 'instant' }); // the day it moved to, in sight
    });
  };
  const label = (n: number) => (rest.includes(d) ? (rest.includes(n) ? `Day ${n} is also a rest day` : `Move rest day to Day ${n}`) : rest.includes(n) ? `Swap Day ${d} with the rest day` : `Swap Day ${d} with Day ${n}`);
  return (
    <span className="swaps">
      {d > 1 ? <button type="button" className="btn sm ghost swapbtn" id={`swap-${d}--1`} aria-label={label(d - 1)} onClick={() => swap(-1)}><span aria-hidden="true">‹</span></button> : <span className="swapgap" aria-hidden="true" />}
      <span className="swaplabel" aria-hidden="true"><span className="swapicon">⇄</span>Swap day</span>
      {d < DAYS.length ? <button type="button" className="btn sm ghost swapbtn" id={`swap-${d}-1`} aria-label={label(d + 1)} onClick={() => swap(1)}><span aria-hidden="true">›</span></button> : <span className="swapgap" aria-hidden="true" />}
    </span>
  );
}

export default function Board() {
  const cfg = useAppStore(s => s.cfg);
  const week = useAppStore(s => s.week);
  const weekStart = useAppStore(s => s.weekStart);
  const logs = useAppStore(s => s.logs);
  const programs = useAppStore(s => s.programs);
  const storeMode = useAppStore(s => s.storeMode);
  const mDay = useAppStore(s => s.mDay);
  const swapFlash = useAppStore(s => s.swapFlash);
  const today = useToday(s => s.today);
  const st = useAppStore.getState();

  const progKey = st.activeProgKey();
  const prog = st.activeProgram(); // a week that is over shows what it ran (ADR 022)
  const fromRecord = st.shownFromRecord();
  const slots = weekSlots(prog, week, st.weekKey());
  const cols = currentLayout(week, slots);
  const rest = restsOf(week);
  const { total, done, skipped: skippedN } = tally(slots, week);
  const pct = total ? Math.round(done / total * 100) : 0;
  const wk = ymd(weekStart);

  // Phones show one day; default to the first day that still has open work.
  let day = mDay;
  if (day == null) { day = DAYS.find(d => !rest.includes(d)) ?? null; for (const d of DAYS) { if (!rest.includes(d) && cols[d].some(s => isOpen(s, week))) { day = d; break; } } }

  // Ticking a rest day that would push workouts off the week asks first: skip them for the week, or cancel and move them yourself.
  const tickRest = (d: number) => {
    const over = st.restOverflow(d);
    if (over.length && !window.confirm(`A rest day on Day ${d} pushes ${over.length === 1 ? 'a workout' : `${over.length} workouts`} off the week:\n\n${over.map(s => `• ${s.items.map(it => exInfo(cfg, it.ex).n).join(' + ')}`).join('\n')}\n\nOK skips ${over.length === 1 ? 'it' : 'them'} for this week. Cancel lets you move ${over.length === 1 ? 'it' : 'them'} first.`)) return;
    st.setRestDay(d, { skipOverflow: true });
  };
  const [, forceTips] = useState(0);
  const hideTip = (k: string) => { LS.set(k, 1); forceTips(n => n + 1); };

  // Yesterday's column (this week only, not on Sunday): cards with nothing checked, unless hidden for today.
  const yCol = todayCol(today) - 1; const todayKey = ymd(today);
  const left = ymd(weekStartOf(today)) === wk && yCol >= 1 && LS.get('hideleftovers') !== todayKey && !onlyElsewhere(slots, week) ? leftovers(week, slots, yCol) : [];
  const targets = left.length ? moveTargets(week, slots, yCol) : [];
  const [filter, setFilter] = useState({ muscle: '', eq: '' });
  const [filterOpen, setFilterOpen] = useState(false); // phones only: the sort and equipment fields fold away
  // Equipment filters cards out; a muscle only sorts them: cards that train it come first (primary, then secondary).
  const filtering = !!filter.eq;
  const sorting = !!filter.muscle;
  const rank = (s: FlatSlot) => muscleRank(cfg, s, filter.muscle);
  const shown = (list: FlatSlot[]) => {
    const l = filtering ? list.filter((s) => matchesFilter(cfg, s, { eq: filter.eq })) : list;
    return sorting ? l.map(s => [s, rank(s)] as const).sort((a, b) => a[1] - b[1]).map(([s]) => s) : l; // stable: program order within a rank
  };
  const muscleName = filter.muscle ? MUSCLES[filter.muscle as MuscleKey].n : '';
  const RANK_SEC = [`Primary: ${muscleName}`, `Secondary: ${muscleName}`, 'Other'];
  const headOf = (s: FlatSlot, day: number) => (sorting ? RANK_SEC[rank(s)] : secOf(s, day));
  const [pick, setPick] = useState<number | null>(null);
  const moveTo = targets.includes(pick as number) ? pick : targets[0];
  const hideLeftovers = () => { LS.set('hideleftovers', todayKey); forceTips(n => n + 1); };

  // Desktop drag and drop between day columns.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overDay, setOverDay] = useState<number | null>(null);
  // The same functions on every draw, so a memoized Card is not redrawn for them.
  const onDragStart = useCallback((e: DragEvent, id: string) => { setDragId(id); try { e.dataTransfer!.setData('text/plain', id); e.dataTransfer!.effectAllowed = 'move'; } catch { /* old browsers */ } }, []);
  const onDragEnd = useCallback(() => { setDragId(null); setOverDay(null); }, []);

  // Swipe between days on phones.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (e: TouchEvent) => {
    if ((e.target as Element).closest('select,input,button,a,.explist')) { swipe.current = null; return; }
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: TouchEvent) => {
    const s0 = swipe.current; swipe.current = null;
    if (!s0 || !window.matchMedia('(max-width:700px)').matches) return;
    const dx = e.changedTouches[0].clientX - s0.x, dy = e.changedTouches[0].clientY - s0.y;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45) { const n = Math.min(DAYS.length, Math.max(1, (day as number) + (dx < 0 ? 1 : -1))); if (n !== day) st.setMDay(n); }
  };

  return (
    <div className="boardroot" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="weekbar">
        <div className="weeknav">
          <button type="button" className="btn sm" aria-label="Previous week" onClick={() => st.gotoWeek('prev')}>‹</button>
          <h2 className="cond">{fmtShort(weekStart)} – {fmtShort(addDays(weekStart, 6))}</h2>
          <button type="button" className="btn sm" aria-label="Next week" onClick={() => st.gotoWeek('next')}>›</button>
          {ymd(weekStartOf(today)) !== wk && <button type="button" className="btn sm ghost" onClick={() => st.gotoWeek('today')}>This week</button>}
        </div>
        <div className="progress">
          <span>{done} of {total} done{skippedN ? ` · ${skippedN} skipped` : ''}</span>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        </div>
      </div>

      {!fromRecord && !programs[progKey] && <div className="notice">{progName(cfg, progKey)} is scheduled this week but hasn't been added yet, so {progName(cfg, 'A')} is shown.</div>}
      {storeMode === 'local' && !tipHidden('hidelocal') && (
        <div className="notice tip">
          <span>{window.claude ? 'Saving on this device only. Open the published page on claude.ai to keep your log everywhere.' : 'Your data is saved in this browser only. Use Export all data in Settings to keep a copy.'}</span>
          <button type="button" className="btn sm ghost" onClick={() => hideTip('hidelocal')}>Got it</button>
        </div>
      )}
      {left.length > 0 && (
        <div className="notice leftovers" role="status">
          <div className="lohead">
            <span>Day {yCol} has {left.length} unchecked exercise{left.length > 1 ? 's' : ''}.</span>
            <button type="button" className="btn sm ghost" onClick={hideLeftovers}>Not now</button>
          </div>
          <div className="actions">
            <button type="button" className="btn sm" onClick={() => st.skipCards(left.map(s => s.id))}>Skip all {left.length}</button>
            {targets.length > 0 && (
              <span className="inline">
                <label htmlFor="leftover-to">Move to</label>
                <select id="leftover-to" value={moveTo ?? ''} onChange={e => setPick(Number(e.target.value))}>
                  {targets.map(c => <option key={c} value={c}>Day {c}{c === yCol + 1 ? ' (today)' : ''}</option>)}
                </select>
                <button type="button" className="btn sm" onClick={() => st.moveCards(left.map(s => s.id), moveTo as number)}>Move</button>
              </span>
            )}
          </div>
        </div>
      )}
      {slots.length === 0 && <FirstRun />}
      <BodyWeightRow key={wk} />
      <div className="filterbar">
        <div className="filtergroup" role="group" aria-label="Sort and filter exercises">
          <button type="button" className="btn sm filtertoggle" aria-expanded={filterOpen} aria-controls="filter-fields" onClick={() => setFilterOpen(o => !o)}>
            Sort &amp; filter{filtering || sorting ? ` · ${(filtering ? 1 : 0) + (sorting ? 1 : 0)} on` : ''}
          </button>
          <div className={`filterfields${filterOpen ? ' open' : ''}`} id="filter-fields">
            <label className="field">Sort by muscle
              <select value={filter.muscle} onChange={e => setFilter(f => ({ ...f, muscle: e.target.value }))}>
                <option value="">Program order</option>
                {M_KEYS.map(k => <option key={k} value={k}>{MUSCLES[k].n}</option>)}
              </select>
            </label>
            <label className="field">Equipment
              <select value={filter.eq} onChange={e => setFilter(f => ({ ...f, eq: e.target.value }))}>
                <option value="">All equipment</option>
                {eqOptions(cfg).map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
            {(filtering || sorting) && <button type="button" className="btn sm ghost" onClick={() => setFilter({ muscle: '', eq: '' })}>Clear</button>}
          </div>
        </div>
        <InjurySwitch />
        {filtering && <span className="note" role="status">Showing {slots.filter(s => matchesFilter(cfg, s, { eq: filter.eq })).length} of {slots.length} cards</span>}
        {sorting && <span className="note" role="status">Cards that train {muscleName.toLowerCase()} are listed first in each day.</span>}
      </div>

      <div className="daytabs" role="tablist" aria-label="Day" onKeyDown={e => {
        const n = { ArrowRight: (day as number) + 1, ArrowLeft: (day as number) - 1, Home: 1, End: DAYS.length }[e.key]; if (n == null) return;
        e.preventDefault(); const d = ((n - 1 + DAYS.length) % DAYS.length) + 1; st.setMDay(d); document.getElementById(`daytab-${d}`)!.focus();
      }}>
        {DAYS.map(d => {
          const t = tally(cols[d], week); const isRest = rest.includes(d);
          const short = isRest ? 'Rest' : t.full ? '✓' : `${t.done}/${t.total}`;
          return (
            <button type="button" role="tab" key={d} id={`daytab-${d}`} aria-selected={d === day} aria-controls={`col-${d}`} tabIndex={d === day ? 0 : -1}
              // The name starts with the visible text ("D1 0/11") so voice control users can say what they see (WCAG 2.5.3).
              className={`${isRest || t.full ? 'full' : ''}${swapFlash?.includes(d) ? ' swapped' : ''}`.trim()} aria-label={`D${d} ${short}: Day ${d}, ${isRest ? 'rest day' : t.full ? 'all done' : `${t.done} of ${t.total} done`}`}
              onClick={() => { st.setMDay(d); window.scrollTo({ top: 0, behavior: motionOK() ? 'auto' : 'instant' }); }}>
              <b aria-hidden="true">D{d}</b>{' '}<span aria-hidden="true">{short}</span>
            </button>
          );
        })}
      </div>

      <div className="board">
        {DAYS.map(d => {
          const pd = dayAt(week, d); // the program day shown here; null for the rest day
          if (pd == null) return (
            <section key={d} id={`col-${d}`} aria-labelledby={`colh-${d} colsub-${d}`} className={`col rest complete${d === day ? ' sel' : ''}${swapFlash?.includes(d) ? ' swapped' : ''}`}>
              {swapFrom(swapFlash, d)}
              <div className="colhead"><div><h3 id={`colh-${d}`}>Day {d}</h3><div className="sub" id={`colsub-${d}`}>Rest day</div><DayDate date={week.restOn} /></div><SwapArrows d={d} /><label className="restchk"><span className="cond" aria-hidden="true">Rest</span><input type="checkbox" className="chk" id={`rest-${d}`} aria-label={`Rest day, Day ${d}`} checked onChange={() => tickRest(d)} /></label></div>
              {cols[d].length > 0 ? (
                <>
                  <div className="notice">Day {d} has exercises. Untick Rest day to train them normally.</div>
                  {shown(cols[d]).map(s => <Card key={s.id} s={s} onDragStart={onDragStart} onDragEnd={onDragEnd} dragging={dragId === s.id} />)}
                </>
              ) : <p className="note">Your workouts moved one day later. Untick to put them back.</p>}
            </section>
          );
          const dayDef = prog.days[pd - 1];
          const list = cols[d];
          const date = dayDate(list, logs, wk);
          const t = tally(list, week);
          // Unfinished cards first (grouped by section); done and skipped ones drop to the bottom.
          const vis = shown(list);
          const open = vis.filter(s => isOpen(s, week));
          const finished = [...vis.filter(s => !isOpen(s, week) && !isSkipped(s, week)), ...vis.filter(s => isSkipped(s, week))];
          const ft = tally(finished, week); // counts the cards under the header (the day's own count ignores the filter)
          return (
            <section
              key={d} id={`col-${d}`} aria-labelledby={`colh-${d}`}
              className={`col${t.full ? ' complete' : ''}${d === day ? ' sel' : ''}${overDay === d ? ' over' : ''}${swapFlash?.includes(d) ? ' swapped' : ''}`}
              onDragOver={e => { if (!dragId) return; e.preventDefault(); setOverDay(d); }}
              onDrop={e => { if (!dragId) return; e.preventDefault(); const id = dragId; onDragEnd(); if (id.startsWith('exp:')) st.addToDay(id.slice(4), d); else st.moveSlot(id, d); }}
            >
              {swapFrom(swapFlash, d)}
              <div className="colhead">
                <input type="checkbox" className="chk" id={`day-${d}`} checked={t.full} aria-label={`Mark all of Day ${d} done`}
                  onChange={e => st.checkDay(d, e.target.checked)} />
                <div>
                  <h3 id={`colh-${d}`} tabIndex={-1}>{dayTitle(dayDef, d)}</h3>
                  <DayDate date={date} />
                  {dayDef.sub && <div className="sub">{dayDef.sub}</div>}
                  <div className="sub daycount">{t.done}/{t.total} done</div>
                </div>
                <SwapArrows d={d} />
                <label className="restchk"><span className="cond" aria-hidden="true">Rest</span><input type="checkbox" className="chk" id={`rest-${d}`} aria-label={`Rest day, Day ${d}`} checked={false} onChange={() => tickRest(d)} /></label>
              </div>
              {filtering && vis.length === 0 && <p className="note">Nothing here matches the filter.</p>}
              {open.map((s, i) => {
                const sec = headOf(s, pd);
                const newSec = i === 0 || sec !== headOf(open[i - 1], pd);
                return (
                  <Fragment key={s.id}>
                    {newSec && <div className="sect">{sec}</div>}
                    <Card s={s} onDragStart={onDragStart} onDragEnd={onDragEnd} dragging={dragId === s.id} />
                  </Fragment>
                );
              })}
              {finished.length > 0 && (
                <>
                  <div className="sect donesect">{[ft.done ? `${ft.done} done` : '', ft.skipped ? `${ft.skipped} skipped` : ''].filter(Boolean).join(' · ')}</div>
                  {finished.map(s => <Card key={s.id} s={s} onDragStart={onDragStart} onDragEnd={onDragEnd} dragging={dragId === s.id} />)}
                </>
              )}
            </section>
          );
        })}
      </div>
      <Experiments day={day as number} onDragStart={onDragStart} onDragEnd={onDragEnd} />
    </div>
  );
}
