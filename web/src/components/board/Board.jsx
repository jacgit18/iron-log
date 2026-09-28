import { Fragment, useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { WARMUP, slotsFor } from '../../lib/data.js';
import { monday, ymd, addDays, fmtShort } from '../../lib/dates.js';
import { tally, currentLayout, isOpen, isSkipped, programFor, progName } from '../../lib/logic.js';
import { LS } from '../../lib/storage.js';
import { daysSinceBackup } from '../../lib/export.js';
import { motionOK } from '../../lib/motion.js';
import Card from './Card.jsx';
import BodyWeightRow from './BodyWeightRow.jsx';

const MODES = [[1, 'Mode 1 · A only'], [2, 'Mode 2 · monthly'], [3, 'Mode 3 · 6 months']];
const tipHidden = k => LS.get(k) === 1; // stored as the string "1", same as the vanilla app

export default function Board() {
  const cfg = useAppStore(s => s.cfg);
  const week = useAppStore(s => s.week);
  const weekStart = useAppStore(s => s.weekStart);
  const programs = useAppStore(s => s.programs);
  const storeMode = useAppStore(s => s.storeMode);
  const moveNote = useAppStore(s => s.moveNote);
  const mDay = useAppStore(s => s.mDay);
  const mcp = useAppStore(s => s.mcp);
  const snoozeBackup = useAppStore(s => s.snoozeBackup);
  const backupBusy = useAppStore(s => s.backupBusy);
  const anyLogs = useAppStore(s => Object.values(s.logs).some(l => l && l.length));
  const st = useAppStore.getState();
  const sinceBackup = daysSinceBackup(cfg);

  const progKey = st.activeProgKey();
  const prog = programs[progKey] || programs.A;
  const slots = slotsFor(prog);
  const cols = currentLayout(week, slots);
  const { total, done, skipped: skippedN } = tally(slots, week);
  const pct = total ? Math.round(done / total * 100) : 0;
  const wk = ymd(weekStart);
  const showMove = moveNote && moveNote.week === wk;

  // Phones show one day; default to the first day that still has open work.
  let day = mDay;
  if (day == null) { day = 1; for (let d = 1; d <= 6; d++) { if (cols[d].some(s => isOpen(s, week))) { day = d; break; } } }

  const [, forceTips] = useState(0);
  const hideTip = k => { LS.set(k, 1); forceTips(n => n + 1); };

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
    if (Math.abs(dx) > 70 && Math.abs(dy) < 45) { const n = Math.min(6, Math.max(1, day + (dx < 0 ? 1 : -1))); if (n !== day) st.setMDay(n); }
  };

  const auto = programFor(cfg, weekStart);
  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div className="weekbar">
        <div className="weeknav">
          <button type="button" className="btn sm" aria-label="Previous week" onClick={() => st.gotoWeek('prev')}>‹</button>
          <h2 className="cond">{fmtShort(weekStart)} – {fmtShort(addDays(weekStart, 6))}</h2>
          <button type="button" className="btn sm" aria-label="Next week" onClick={() => st.gotoWeek('next')}>›</button>
          {ymd(monday(new Date())) !== wk && <button type="button" className="btn sm ghost" onClick={() => st.gotoWeek('today')}>This week</button>}
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
          <span>Targets use your last logged weight. Add a 1RM (in Settings or when you log a set) to get phase-based targets instead.</span>
          <button type="button" className="btn sm ghost" onClick={() => hideTip('hidetip')}>Got it</button>
        </div>
      )}
      {mcp && anyLogs && !snoozeBackup && (sinceBackup == null || sinceBackup >= 7) && (
        <div className="notice tip">
          <span>{sinceBackup == null ? 'Your training data hasn’t been backed up to GitHub yet.' : `Last GitHub backup was ${sinceBackup} days ago.`}</span>
          <span>
            <button type="button" className="btn sm" disabled={backupBusy} onClick={st.backupToGitHub}>{backupBusy ? 'Backing up…' : 'Back up now'}</button>{' '}
            <button type="button" className="btn sm ghost" onClick={st.snooze}>Later</button>
          </span>
        </div>
      )}
      {storeMode === 'local' && !tipHidden('hidelocal') && (
        <div className="notice tip">
          <span>{window.claude ? 'Saving on this device only. Open the published page on claude.ai to keep your log everywhere.' : 'Your data is saved in this browser only. Use Export on the Progress tab to back it up.'}</span>
          <button type="button" className="btn sm ghost" onClick={() => hideTip('hidelocal')}>Got it</button>
        </div>
      )}
      {showMove && (
        <div className="notice movewarn" role="status" ref={moveRef}>
          <div><b>Heads-up:</b> {moveNote.lines.join(' ')}</div>
          <div className="actions">
            <button type="button" className="btn sm" onClick={st.undoMove}>Move back to Day {moveNote.from}</button>
            <button type="button" className="btn sm ghost" onClick={st.dismissMove}>Keep it</button>
          </div>
        </div>
      )}
      <BodyWeightRow key={wk} />

      <div className="daytabs" role="tablist" aria-label="Day" onKeyDown={e => {
        const n = { ArrowRight: day + 1, ArrowLeft: day - 1, Home: 1, End: 6 }[e.key]; if (n == null) return;
        e.preventDefault(); const d = ((n - 1 + 6) % 6) + 1; st.setMDay(d); document.getElementById(`daytab-${d}`).focus();
      }}>
        {[1, 2, 3, 4, 5, 6].map(d => {
          const t = tally(cols[d], week);
          return (
            <button type="button" role="tab" key={d} id={`daytab-${d}`} aria-selected={d === day} aria-controls={`col-${d}`} tabIndex={d === day ? 0 : -1}
              className={t.full ? 'full' : ''} aria-label={`Day ${d}, ${t.full ? 'all done' : `${t.done} of ${t.total} done`}`}
              onClick={() => { st.setMDay(d); window.scrollTo({ top: 0, behavior: motionOK() ? 'auto' : 'instant' }); }}>
              <b aria-hidden="true">D{d}</b><span aria-hidden="true">{t.full ? '✓' : `${t.done}/${t.total}`}</span>
            </button>
          );
        })}
      </div>

      <div className="board">
        {[1, 2, 3, 4, 5, 6].map(d => {
          const dayDef = prog.days[d - 1];
          const list = cols[d];
          const t = tally(list, week);
          const warm = week.warm[d] || {};
          const pending = dayDef.makeup ? slots.filter(s => s.day < 5 && (week.moved[s.id] || s.day) < 5 && isOpen(s, week)).length : 0;
          // Unfinished cards first (grouped by section); done and skipped ones drop to the bottom.
          const open = list.filter(s => isOpen(s, week));
          const finished = [...list.filter(s => !isOpen(s, week) && !isSkipped(s, week)), ...list.filter(s => isSkipped(s, week))];
          const ft = tally(finished, week);
          let lastSec = null;
          return (
            <section
              key={d} id={`col-${d}`} aria-labelledby={`colh-${d}`}
              className={`col${t.full ? ' complete' : ''}${d === day ? ' sel' : ''}${overDay === d ? ' over' : ''}`}
              onDragOver={e => { if (!dragId) return; e.preventDefault(); setOverDay(d); }}
              onDrop={e => { if (!dragId) return; e.preventDefault(); const id = dragId; onDragEnd(); st.moveSlot(id, d); }}
            >
              <div className="colhead">
                <input type="checkbox" className="chk" id={`day-${d}`} checked={t.full} aria-label={`Mark all of Day ${d} done`}
                  onChange={e => st.checkDay(d, e.target.checked)} />
                <div>
                  <h3 id={`colh-${d}`}>{dayDef.title}</h3>
                  {dayDef.sub && <div className="sub">{dayDef.sub}</div>}
                </div>
                <span className="count">{t.done}/{t.total}</span>
              </div>
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
              {dayDef.makeup && (
                <div className="makeup">
                  Make-up day for anything skipped.{' '}
                  {pending > 0 && <button type="button" className="btn sm" onClick={st.pullUnfinished}>Pull in {pending} unfinished</button>}
                </div>
              )}
              {open.map(s => {
                const sec = s.day === d ? s.sec : 'Moved here';
                const newSec = sec !== lastSec; lastSec = sec;
                return (
                  <Fragment key={s.id}>
                    {newSec && <div className="sect">{sec}</div>}
                    <Card s={s} curDay={d} onDragStart={onDragStart} onDragEnd={onDragEnd} dragging={dragId === s.id} />
                  </Fragment>
                );
              })}
              {finished.length > 0 && (
                <>
                  <div className="sect donesect">{[ft.done ? `${ft.done} done` : '', ft.skipped ? `${ft.skipped} skipped` : ''].filter(Boolean).join(' · ')}</div>
                  {finished.map(s => <Card key={s.id} s={s} curDay={d} onDragStart={onDragStart} onDragEnd={onDragEnd} dragging={dragId === s.id} />)}
                </>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
