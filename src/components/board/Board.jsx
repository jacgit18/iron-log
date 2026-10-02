import { Fragment, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { WARMUP } from '../../lib/data.js';
import { monday, ymd, addDays, fmtShort, fmtDayDate } from '../../lib/dates.js';
import { weekSlots, tally, currentLayout, isOpen, isSkipped, programFor, progName, DAYS, dayAt, dayTitle, dayDate, todayCol, leftovers, moveTargets } from '../../lib/logic.js';
import { LS } from '../../lib/storage.js';
import { daysSince } from '../../lib/export.js';
import { motionOK } from '../../lib/motion.js';
import Card from './Card.jsx';
import BodyWeightRow from './BodyWeightRow.jsx';
import Experiments from './Experiments.jsx';

// Cards moved in from another day are grouped under their own heading.
const secOf = (s, day) => (s.day === day ? s.sec : 'Moved here');
const MODES = [[1, 'Mode 1 · A only'], [2, 'Mode 2 · monthly'], [3, 'Mode 3 · 6 months']];
const tipHidden = k => LS.get(k) === 1; // stored as the string "1", same as the vanilla app

// Left/right arrows that swap a column with its neighbor. Focus follows the workout to its new column.
function SwapArrows({ d }) {
  const rest = useAppStore(s => s.week.rest);
  const swap = dir => {
    if (!useAppStore.getState().swapDays(d, dir)) return;
    const e = d + dir;
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => (document.getElementById(`swap-${e}-${dir}`) || document.getElementById(`swap-${e}-${-dir}`))?.focus());
  };
  const label = n => (d === rest ? `Move rest day to Day ${n}` : n === rest ? `Swap Day ${d} with the rest day` : `Swap Day ${d} with Day ${n}`);
  return (
    <span className="swaps">
      {d > 1 && <button type="button" className="btn sm ghost swapbtn" id={`swap-${d}--1`} aria-label={label(d - 1)} onClick={() => swap(-1)}><span aria-hidden="true">←</span></button>}
      {d < DAYS.length && <button type="button" className="btn sm ghost swapbtn" id={`swap-${d}-1`} aria-label={label(d + 1)} onClick={() => swap(1)}><span aria-hidden="true">→</span></button>}
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
  const moveNote = useAppStore(s => s.moveNote);
  const mDay = useAppStore(s => s.mDay);
  const canBackup = useAppStore(s => !!(s.mcp || (s.ghDirect && s.ghToken)));
  const snoozeBackup = useAppStore(s => s.snoozeBackup);
  const backupBusy = useAppStore(s => s.backupBusy);
  const anyLogs = useAppStore(s => Object.values(s.logs).some(l => l && l.length));
  const today = useToday(s => s.today);
  const st = useAppStore.getState();
  const sinceBackup = daysSince(st.lastBackup());

  const progKey = st.activeProgKey();
  const prog = programs[progKey] || programs.A;
  const slots = weekSlots(prog, week);
  const cols = currentLayout(week, slots);
  const rest = week.rest || null;
  const { total, done, skipped: skippedN } = tally(slots, week);
  const pct = total ? Math.round(done / total * 100) : 0;
  const wk = ymd(weekStart);
  const showMove = moveNote && moveNote.week === wk;

  // Phones show one day; default to the first day that still has open work.
  let day = mDay;
  if (day == null) { day = DAYS.find(d => d !== rest); for (const d of DAYS) { if (d !== rest && cols[d].some(s => isOpen(s, week))) { day = d; break; } } }

  const [, forceTips] = useState(0);
  const hideTip = k => { LS.set(k, 1); forceTips(n => n + 1); };

  // Yesterday's column (this week only, not on Sunday): cards with nothing checked, unless hidden for today.
  const yCol = todayCol(today) - 1; const todayKey = ymd(today);
  const left = ymd(monday(today)) === wk && yCol >= 1 && LS.get('hideleftovers') !== todayKey ? leftovers(week, slots, yCol) : [];
  const targets = left.length ? moveTargets(week, slots, yCol) : [];
  const [pick, setPick] = useState(null);
  const moveTo = targets.includes(pick) ? pick : targets[0];
  const hideLeftovers = () => { LS.set('hideleftovers', todayKey); forceTips(n => n + 1); };

  const moveRef = useRef(null);
  useEffect(() => { if (moveRef.current) moveRef.current.scrollIntoView({ block: 'nearest', behavior: motionOK() ? 'smooth' : 'instant' }); }, [moveNote]);

  // Desktop drag and drop between day columns.
  const [dragId, setDragId] = useState(null);
  const [overDay, setOverDay] = useState(null);
  const onDragStart = (e, id) => { setDragId(id); try { e.dataTransfer.setData('text/plain', id); e.dataTransfer.effectAllowed = 'move'; } catch { /* old browsers */ } };
  const onDragEnd = () => { setDragId(null); setOverDay(null); };

  // Swipe between days on phones.
  const swipe = useRef(null);
  const onTouchStart = e => {
    if (e.target.closest('select,input,button,a')) { swipe.current = null; return; }
    swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = e => {
    const s0 = swipe.current; swipe.current = null;
    if (!s0 || !window.matchMedia('(max-width:700px)').matches) return;
    const dx = e.changedTouches[0].clientX - s0.x, dy = e.changedTouches[0].clientY - s0.y;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45) { const n = Math.min(DAYS.length, Math.max(1, day + (dx < 0 ? 1 : -1))); if (n !== day) st.setMDay(n); }
  };

  const auto = programFor(cfg, weekStart);
  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="weekbar">
        <div className="weeknav">
          <button type="button" className="btn sm" aria-label="Previous week" onClick={() => st.gotoWeek('prev')}>‹</button>
          <h2 className="cond">{fmtShort(weekStart)} – {fmtShort(addDays(weekStart, 6))}</h2>
          <button type="button" className="btn sm" aria-label="Next week" onClick={() => st.gotoWeek('next')}>›</button>
          {ymd(monday(today)) !== wk && <button type="button" className="btn sm ghost" onClick={() => st.gotoWeek('today')}>This week</button>}
          <label className="seg modesel" htmlFor="board-mode">
            <span className="sr">Mode</span>
            <select id="board-mode" aria-label="Program mode" value={cfg.mode} onChange={e => st.setMode(Number(e.target.value))}>
              {MODES.map(([m, t]) => <option key={m} value={m}>{t}</option>)}
            </select>
          </label>
          {cfg.mode === 2 && (
            <>
              <div className="seg" role="group" aria-label="Program this week">
                {['A', 'B'].map(k => (
                  <button type="button" key={k} className={k === progKey ? 'on' : ''} aria-pressed={k === progKey} onClick={() => st.setWeekProg(k)}>{progName(cfg, k)}</button>
                ))}
              </div>
              <span className="saveflag">{progKey === auto ? 'Set by month' : `Switched · month default is ${progName(cfg, auto)}`}</span>
            </>
          )}
        </div>
        <div className="progress">
          <span>{done} of {total} done{skippedN ? ` · ${skippedN} skipped` : ''}</span>
          <div className="bar"><i style={{ width: `${pct}%` }} /></div>
        </div>
      </div>

      {!programs[progKey] && <div className="notice">{progName(cfg, progKey)} is scheduled this week but hasn't been added yet, so {progName(cfg, 'A')} is shown.</div>}
      {!Object.keys(cfg.rm).length && !tipHidden('hidetip') && (
        <div className="notice tip">
          <span>Targets use your last logged weight. Add a one-rep max (1RM) in Settings or when you log a set to get phase-based targets instead.</span>
          <button type="button" className="btn sm ghost" onClick={() => hideTip('hidetip')}>Got it</button>
        </div>
      )}
      {canBackup && anyLogs && !snoozeBackup && (sinceBackup == null || sinceBackup >= 7) && (
        <div className="notice tip">
          <span>{sinceBackup == null ? 'Your training data hasn’t been backed up to GitHub yet.' : `Last GitHub backup was ${sinceBackup} days ago.`}</span>
          <span>
            <button type="button" className="btn sm" disabled={backupBusy} onClick={st.backupNow}>{backupBusy ? 'Backing up…' : 'Back up now'}</button>{' '}
            <button type="button" className="btn sm ghost" onClick={st.snooze}>Later</button>
          </span>
        </div>
      )}
      {storeMode === 'local' && !tipHidden('hidelocal') && (
        <div className="notice tip">
          <span>{window.claude ? 'Saving on this device only. Open the published page on claude.ai to keep your log everywhere.' : 'Your data is saved in this browser only. Back it up to GitHub in Settings, or use Export on the Progress tab.'}</span>
          <button type="button" className="btn sm ghost" onClick={() => hideTip('hidelocal')}>Got it</button>
        </div>
      )}
      {left.length > 0 && (
        <div className="notice leftovers" role="status">
          <div>Day {yCol} has {left.length} unchecked exercise{left.length > 1 ? 's' : ''}.</div>
          <div className="actions">
            <button type="button" className="btn sm" onClick={() => st.skipCards(left.map(s => s.id))}>Skip all {left.length}</button>
            {targets.length > 0 && (
              <span className="inline">
                <label htmlFor="leftover-to">Move to</label>
                <select id="leftover-to" value={moveTo} onChange={e => setPick(Number(e.target.value))}>
                  {targets.map(c => <option key={c} value={c}>Day {c}{c === yCol + 1 ? ' (today)' : ''}</option>)}
                </select>
                <button type="button" className="btn sm" onClick={() => st.moveCards(left.map(s => s.id), moveTo)}>Move</button>
              </span>
            )}
            <button type="button" className="btn sm ghost" onClick={hideLeftovers}>Not now</button>
          </div>
        </div>
      )}
      {showMove && (
        <div className="notice movewarn" role="status" ref={moveRef}>
          <div><b>Heads-up:</b> {moveNote.lines.join(' ')}</div>
          <div className="actions">
            {moveNote.alt && <button type="button" className="btn sm" onClick={() => st.moveSlot(moveNote.slot, moveNote.alt)}>Move to Day {moveNote.alt} instead</button>}
            <button type="button" className="btn sm" onClick={st.undoMove}>Move back to Day {moveNote.fromShown}</button>
            <button type="button" className="btn sm ghost" onClick={st.dismissMove}>Keep it</button>
          </div>
        </div>
      )}
      <BodyWeightRow key={wk} />

      <div className="daytabs" role="tablist" aria-label="Day" onKeyDown={e => {
        const n = { ArrowRight: day + 1, ArrowLeft: day - 1, Home: 1, End: DAYS.length }[e.key]; if (n == null) return;
        e.preventDefault(); const d = ((n - 1 + DAYS.length) % DAYS.length) + 1; st.setMDay(d); document.getElementById(`daytab-${d}`).focus();
      }}>
        {DAYS.map(d => {
          const t = tally(cols[d], week); const isRest = d === rest;
          const short = isRest ? 'Rest' : t.full ? '✓' : `${t.done}/${t.total}`;
          return (
            <button type="button" role="tab" key={d} id={`daytab-${d}`} aria-selected={d === day} aria-controls={`col-${d}`} tabIndex={d === day ? 0 : -1}
              // The name starts with the visible text ("D1 0/11") so voice control users can say what they see (WCAG 2.5.3).
              className={isRest || t.full ? 'full' : ''} aria-label={`D${d} ${short}: Day ${d}, ${isRest ? 'rest day' : t.full ? 'all done' : `${t.done} of ${t.total} done`}`}
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
            <section key={d} id={`col-${d}`} aria-labelledby={`colh-${d} colsub-${d}`} className={`col rest complete${d === day ? ' sel' : ''}`}>
              <div className="colhead"><div><h3 id={`colh-${d}`}>Day {d}</h3><div className="sub" id={`colsub-${d}`}>Rest day</div>{week.restOn && <div className="sub daydate">{fmtDayDate(week.restOn)}</div>}</div><SwapArrows d={d} /></div>
              <label className="restchk"><input type="checkbox" className="chk" id={`rest-${d}`} aria-label={`Rest day, Day ${d}`} checked onChange={() => st.setRestDay(d)} /> Rest day</label>
              {cols[d].length > 0 ? (
                <>
                  <div className="notice">Day {d} has exercises. Untick Rest day to train them normally.</div>
                  {cols[d].map(s => <Card key={s.id} s={s} onDragStart={onDragStart} onDragEnd={onDragEnd} dragging={dragId === s.id} />)}
                </>
              ) : <p className="note">Your workouts moved one day later. Untick to put them back.</p>}
            </section>
          );
          const dayDef = prog.days[pd - 1];
          const list = cols[d];
          const date = dayDate(list, logs, wk);
          const t = tally(list, week);
          const warm = week.warm[pd] || {};
          // Unfinished cards first (grouped by section); done and skipped ones drop to the bottom.
          const open = list.filter(s => isOpen(s, week));
          const finished = [...list.filter(s => !isOpen(s, week) && !isSkipped(s, week)), ...list.filter(s => isSkipped(s, week))];
          const ft = tally(finished, week);
          return (
            <section
              key={d} id={`col-${d}`} aria-labelledby={`colh-${d}`}
              className={`col${t.full ? ' complete' : ''}${d === day ? ' sel' : ''}${overDay === d ? ' over' : ''}`}
              onDragOver={e => { if (!dragId) return; e.preventDefault(); setOverDay(d); }}
              onDrop={e => { if (!dragId) return; e.preventDefault(); const id = dragId; onDragEnd(); if (id.startsWith('exp:')) st.addToDay(id.slice(4), d); else st.moveSlot(id, d); }}
            >
              <div className="colhead">
                <input type="checkbox" className="chk" id={`day-${d}`} checked={t.full} aria-label={`Mark all of Day ${d} done`}
                  onChange={e => st.checkDay(d, e.target.checked)} />
                <div>
                  <h3 id={`colh-${d}`}>{dayTitle(dayDef, d)}</h3>
                  {date && <div className="sub daydate">{fmtDayDate(date)}</div>}
                  {dayDef.sub && <div className="sub">{dayDef.sub}</div>}
                </div>
                <span className="count">{t.done}/{t.total}</span>
                <SwapArrows d={d} />
              </div>
              <label className="restchk"><input type="checkbox" className="chk" id={`rest-${d}`} aria-label={`Rest day, Day ${d}`} checked={false} onChange={() => st.setRestDay(d)} /> Rest day</label>
              <div className="warm">
                <span className="tag">Warm-up</span>
                {WARMUP.map(x => (
                  <label key={x.id}>
                    <input type="checkbox" className="chk" id={`warm-${d}-${x.id}`} checked={!!warm[x.id]}
                      onChange={e => st.setWarm(d, x.id, e.target.checked)} />
                    {x.id === 'sled' && prog.warm ? prog.warm : x.n} <span className="rx">· {x.rx}</span>
                  </label>
                ))}
              </div>
              {open.map((s, i) => {
                const sec = secOf(s, pd);
                const newSec = i === 0 || sec !== secOf(open[i - 1], pd);
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
      <Experiments day={day} onDragStart={onDragStart} onDragEnd={onDragEnd} />
    </div>
  );
}
