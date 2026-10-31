import type { LibraryItem, Program } from '../../types.ts';
import type { EdMoved } from '../../store/types.ts';
import type { ProgKey } from '../../types.ts';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { PHASES } from '../../lib/data.js';
import { progName, DAYS } from '../../lib/logic.js';
import { exerciseCount } from '../../lib/exerciseCount.js';
import { slotSummary } from '../../lib/programMove.js';
import { sameProg, libDate } from '../../lib/export.js';
import { MON, fmtShort, parseDate, weekStartOf, ymd } from '../../shared/dates.js';
import ArmedButton from '../ArmedButton.jsx';
import CommitInput from '../CommitInput.jsx';
import Icon from '../Icon.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import ExerciseLibrary from './ExerciseLibrary.jsx';
import StretchLibrary from './StretchLibrary.jsx';
import { shiftOf, useDragReorder } from './useDragReorder.js';
import { pageOf, programKey, programPath } from '../../lib/route.js';
import { navigate, useRoutePath } from '../useRoute.js';
import './Editor.css';

const progStats = (p: Program) => { const n = p.days.reduce((a, d) => a + d.slots.length, 0); return `${n} exercise${n === 1 ? '' : 's'}`; };

// Where a moved card went, for the Moved notice and its Go to button: a day title in this program, or the other program and its day.
const movedWhere = (m: EdMoved, prog: { days: { title: string }[] }) => (m.toKey ? `${m.toLabel} · Day ${m.to}` : prog.days[m.to - 1]!.title);

function LibRow({ name, meta, inUse, onLoad, loadLabel, extra, removing }: { name: string; meta: string; inUse: boolean; onLoad: () => void; loadLabel: string; extra?: ReactNode; removing?: boolean }) {
  return (
    <div className={`edrow${inUse ? ' inuse' : ''}${removing ? ' removing' : ''}`}>
      <div className="edmain">{removing && <span className="tag rmtag">Will be deleted · tap Delete again</span>}<b>{name}</b><span className="note">{meta}</span></div>
      <div className="edbtns">
        {inUse ? <span className="pill">In use</span> : <ArmedButton className="btn sm" aria-label={`Load ${name}`} label="Load" armedLabel={loadLabel} onConfirm={onLoad} />}
        {extra}
      </div>
    </div>
  );
}

function Library({ k, custom }: { k: string; custom: boolean }) {
  const cfg = useAppStore(s => s.cfg); const library = useAppStore(s => s.library); const programs = useAppStore(s => s.programs);
  const st = useAppStore.getState();
  const [name, setName] = useState('');
  const [arming, setArming] = useState<string | null>(null); // the program whose Delete was pressed once
  const today = useToday(s => s.today);
  const cur = programs[k]; const pn = progName(cfg, k);
  const items = [...library].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  const saved = !custom || library.some(it => sameProg(it.prog, cur));
  const loadLabel = `Tap to load into ${pn}`;
  return (
    <section className="panel edpanel edprog lib mt-16">
      <div className="inline spread">
        <h2>Program library</h2>
        <button type="button" className="btn" onClick={() => { if (!st.blocked()) st.openModal({ type: 'newprog' }); }}>Create a program</button>
      </div>
      <p className="note">Load a version into {pn}. Whatever {pn} has now is saved here first if it isn't already, so loading never loses anything.</p>
      <RemovedNotice scope="library" />
      <div className="edlist">
        {items.map(it => (
          <LibRow
            key={it.id} name={it.name} removing={arming === it.id} inUse={custom && sameProg(it.prog, cur)} loadLabel={loadLabel} onLoad={() => st.loadVersion(it.id, k as ProgKey)}
            meta={`${it.created ? (it.from ? `Created from ${progName(cfg, it.from)}` : 'Created new') : `From ${progName(cfg, it.from as string)}`} · ${libDate(it.at)} · ${progStats(it.prog)}${it.auto ? ' · auto-saved' : ''}`}
            extra={<>
              <button type="button" className="btn sm" aria-label={`Edit ${it.name}`} onClick={() => { st.setEdProg('L:' + it.id); st.setEdDay(1); window.scrollTo({ top: 0 }); }}>Edit</button>
              <ArmedButton className={`btn sm ${arming === it.id ? 'danger' : 'ghost'}`} aria-label={`Delete ${it.name}`} label="Delete" armedLabel="Tap again to delete" onArmedChange={a => setArming(a ? it.id : null)} onConfirm={() => { setArming(null); st.deleteLibItem(it.id); }} />
            </>}
          />
        ))}
        {!items.length && <p className="note">No programs yet. Create one to build your own.</p>}
      </div>
      <form className="libsave" noValidate onSubmit={e => { e.preventDefault(); st.saveCurrentAs(name); setName(''); }}>
        <label className="field grow">Save {pn} as
          <input id="lib-name" maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder={`e.g. ${pn} · ${MON[today.getMonth()]} ${today.getFullYear()}`} />
        </label>
        <button type="submit" className="btn primary">Save a copy</button>
      </form>
      {!saved && <p className="note">{pn} has changes that aren't in a saved copy yet.</p>}
    </section>
  );
}

function LibItemPanel({ it }: { it: LibraryItem }) {
  const cfg = useAppStore(s => s.cfg); const st = useAppStore.getState();
  return (
    <section className="panel edpanel edprog lib mt-16">
      <h2>Put it into the rotation</h2>
      <p className="note">Loading replaces what's in that slot. The program there now is saved to the library first if it isn't already, so nothing is lost. {it.name} stays in the library too.</p>
      <div className="actions start flexwrap">
        {(['A', 'B'] as const).map(k => (
          <ArmedButton key={k} className="btn primary" label={`Load into ${progName(cfg, k)}`} armedLabel={`Tap to load into ${progName(cfg, k)}`} onConfirm={() => st.loadVersion(it.id, k)} />
        ))}
        <ArmedButton className="btn ghost" label="Delete program" armedLabel="Tap again to delete" onConfirm={() => st.deleteLibItem(it.id)} />
      </div>
    </section>
  );
}

function ProgramEditor() {
  const cfg = useAppStore(s => s.cfg);
  const edDay = useAppStore(s => s.edDay); const edProg = useAppStore(s => s.edProg);
  const k = useAppStore(s => s.edKey()); const item = useAppStore(s => s.edItem());
  const programs = useAppStore(s => s.programs);
  const prog = item ? { ...item.prog, key: 'N' } : programs[k];
  const st = useAppStore.getState();
  // Pin the editor to the program it opened on, like the original, so it doesn't follow later board changes.
  useEffect(() => { if (edProg !== k) st.setEdProg(k); }, [edProg, k, st]);
  // The program shown is in the address (#/program/b). An address that names one opens it; picking A or B (or arriving on plain #/program) swaps the address to the one shown.
  // A library program has no address of its own (an id never goes in one). `prevK` tells a change of program from the first look, so a pasted address is not overwritten.
  const path = useRoutePath(); const named = programKey(path); const prevK = useRef<string | null>(null);
  useEffect(() => { if (named && named !== k) st.setEdProg(named); }, [named]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const changed = prevK.current !== null && prevK.current !== k; prevK.current = k;
    const to = programPath(k);
    if (to && (path === 'program' || changed)) navigate(to, 'replace');
  }, [k, path]); // eslint-disable-line react-hooks/exhaustive-deps
  // When the panel that held the focused button is replaced (edit/create/load), land on the editor heading.
  useEffect(() => {
    const a = document.activeElement;
    if (!a || a === document.body || !a.isConnected) document.getElementById('ed-title')?.focus();
  }, [k]);

  const thisWeek = ymd(weekStartOf(useToday(s => s.today)));
  const lib = !!item; const day = prog.days[edDay - 1];
  const { drag, rowRef, handleProps } = useDragReorder(day.slots.length, st.reorderEdSlot);
  const custom = !lib && !st.isOriginal(prog as Program, k as ProgKey);
  const edName = lib ? item.name : progName(cfg, k);
  // The row whose Remove is armed (pressed once): it is shown marked for removal until the second press or a move away.
  const [arming, setArming] = useState<number | null>(null);
  const removed = useAppStore(s => s.edRemoved);
  const showRemoved = removed && removed.key === k && removed.day === edDay ? removed : null;
  // The pressed Remove button is gone with its row, so put focus on Undo: only right after a Remove, not when the tab opens again.
  const undoRef = useRef<HTMLButtonElement>(null);
  const justRemoved = useRef(false);
  useEffect(() => { if (removed && justRemoved.current) { justRemoved.current = false; undoRef.current?.focus(); } }, [removed]);
  // The Undo belongs to this visit to the editor: leaving the Program tab drops it.
  useEffect(() => () => { useAppStore.getState().dismissEdRemoved(); }, []);
  // Same for the Moved notice. Its Go to button opens the day the card went to and puts focus on that card's Move to select.
  const moved = useAppStore(s => s.edMoved);
  const showMoved = moved && moved.key === k && moved.from === edDay ? moved : null;
  const movedUndoRef = useRef<HTMLButtonElement>(null);
  const focusAfterGo = useRef<string | null>(null);
  // Arrow keys on a closed select change its value at once (on macOS they open the menu). A change that comes from them waits here for Enter (Escape or leaving drops it), so a keyboard user can look through the days before a card moves.
  const [pendingDay, setPendingDay] = useState<{ i: number; to: number } | null>(null);
  const arrowKey = useRef(false);
  const applyMove = (i: number, to: number) => {
    setPendingDay(null);
    if (to !== edDay) st.moveEdSlotToDay(i, to);
  };
  // The Move to day select of a card.
  const daySelect = (sl: { id: string }, i: number, label: string) => {
    const pend = pendingDay?.i === i;
    return (
      <select className="edmove" id={`mv-${sl.id}`} aria-label={`Move to day (${label})`} value={pend ? pendingDay.to : edDay}
        onChange={e => { const to = Number(e.target.value); if (arrowKey.current) setPendingDay({ i, to }); else applyMove(i, to); }}
        onKeyDown={e => {
          arrowKey.current = e.key.startsWith('Arrow') && !e.altKey;
          if (arrowKey.current) setTimeout(() => { arrowKey.current = false; }, 0); // a closed select changes inside this keydown; where the arrow opens the menu instead (macOS) the later pick must move the card
          if (e.key === 'Enter' && pend) { e.preventDefault(); applyMove(i, pendingDay.to); } else if (e.key === 'Escape') setPendingDay(null);
        }}
        onBlur={() => setPendingDay(null)}>
        {DAYS.map(d => <option key={d} value={d}>{d === edDay ? `Move to… (Day ${d})` : `Move to Day ${d}`}</option>)}
      </select>
    );
  };
  // A move that happened (from the select or the Move… sheet) leaves the moved row behind: focus goes to Undo.
  useEffect(() => { if (moved) movedUndoRef.current?.focus(); }, [moved]);
  useEffect(() => { if (focusAfterGo.current) { document.getElementById(focusAfterGo.current)?.focus(); focusAfterGo.current = null; } }, [edDay, k]);
  useEffect(() => () => { useAppStore.getState().dismissEdMoved(); }, []);
  const addBtn = <button type="button" className="btn primary" onClick={() => { if (!st.blocked()) st.openModal({ type: 'slot', idx: null }); }}>+ Add exercise</button>;

  return (
    <>
      <div className="edtop">
        <div className="seg" role="group" aria-label="Program to edit">
          {['A', 'B'].map(p => <button type="button" key={p} className={p === k ? 'on' : ''} aria-pressed={p === k} onClick={() => st.setEdProg(p)}>{progName(cfg, p)}</button>)}
          {lib && <button type="button" className="on segname" aria-pressed="true">{item.name}</button>}
        </div>
        <div className="daystep" role="group" aria-label="Day stepper">
          <button type="button" className="btn daystepbtn" aria-label="Previous day" aria-disabled={edDay === 1} onClick={() => { if (edDay > 1) st.setEdDay(edDay - 1); }}><Icon name="chevron-left" /></button>
          <select className="daypick" aria-label="Day to edit" value={edDay} onChange={e => st.setEdDay(Number(e.target.value))}>
            {DAYS.map(d => { const n = exerciseCount(prog.days[d - 1]?.slots ?? []); return <option key={d} value={d}>{`Day ${d} of ${DAYS.length} · ${n} ${n === 1 ? 'exercise' : 'exercises'}`}</option>; })}
          </select>
          <button type="button" className="btn daystepbtn" aria-label="Next day" aria-disabled={edDay === DAYS.length} onClick={() => { if (edDay < DAYS.length) st.setEdDay(edDay + 1); }}><Icon name="chevron-right" /></button>
        </div>
        <div className="seg daybtns" role="group" aria-label="Jump to day">
          {DAYS.map(d => <button type="button" key={d} className={d === edDay ? 'on' : ''} aria-pressed={d === edDay} onClick={() => st.setEdDay(d)}>Day {d}</button>)}
        </div>
      </div>
      {lib ? (
        <>
          <div className="notice tip libnote"><span><b>{item.name}</b> is in your library, not in the rotation. Build it here, then load it into {progName(cfg, 'A')} or {progName(cfg, 'B')} when you're ready to train it.</span></div>
          <label className="field progname">Program name
            <CommitInput key={`L${item.id}:${item.name}`} id="prog-name" maxLength={60} value={item.name} onCommit={st.renameLibItem} />
          </label>
        </>
      ) : null}
      <section className="panel edpanel edprog">
        <div className="inline flexwrap"><h2 id="ed-title" tabIndex={-1} className="mr-auto">{edName} · {day.title}</h2></div>
        <label className="field">Day label
          <CommitInput key={`${k}:${edDay}:${day.sub || ''}`} id="ed-sub" value={day.sub || ''} placeholder="e.g. Lower body + reactive power" onCommit={st.setDaySub} />
        </label>
        <div className="actions edadd start">{addBtn}</div>
        {showRemoved && (
          <div className="notice movewarn removednote" role="status">
            <div><b>Removed</b> {slotSummary(cfg, showRemoved.slot)} from {day.title}.</div>
            <div className="actions">
              <button type="button" className="btn sm" ref={undoRef} onClick={st.undoRemoveEdSlot}>Undo</button>
              <button type="button" className="btn sm ghost" onClick={st.dismissEdRemoved}>Dismiss</button>
            </div>
          </div>
        )}
        {showMoved && (
          <div className="notice movewarn removednote" role="status">
            <div><b>Moved</b> {slotSummary(cfg, showMoved.slot)} to {movedWhere(showMoved, prog)}.</div>
            <div className="actions">
              <button type="button" className="btn sm" ref={movedUndoRef} onClick={st.undoMoveEdSlot}>Undo</button>
              <button type="button" className="btn sm" onClick={() => { focusAfterGo.current = showMoved.slot.id ? `mv-${showMoved.slot.id}` : null; if (showMoved.toKey) st.setEdProg(showMoved.toKey); st.setEdDay(showMoved.to); }}>Go to {movedWhere(showMoved, prog)}</button>
              <button type="button" className="btn sm ghost" onClick={st.dismissEdMoved}>Dismiss</button>
            </div>
          </div>
        )}
        <div className="edlist">
          {!day.slots.length && <p className="note">No exercises on this day yet.</p>}
          {day.slots.map((sl, i) => {
            const newSec = i === 0 || sl.sec !== day.slots[i - 1].sec;
            const starts = sl.from && sl.from > thisWeek ? `Starts ${fmtShort(parseDate(sl.from))}` : ''; // added to a finished day: not on the board until then
            const tag = [sl.tier, sl.type === 'superset' ? 'Superset' : sl.type === 'either' ? 'Either / or' : '', starts].filter(Boolean).join(' · ');
            return (
              <Fragment key={sl.id || i}>
                {newSec && <div className="sect">{sl.sec || ''}</div>}
                <div
                  ref={rowRef(i)}
                  className={`edrow${drag?.from === i ? ' dragging' : drag ? ' shifting' : ''}${arming === i ? ' removing' : ''}`}
                  style={drag ? { transform: `translateY(${drag.from === i ? drag.dy : shiftOf(drag, i)}px)` } : undefined}
                >
                  <span className="draghandle" aria-hidden="true" title="Drag to reorder" {...handleProps(i)}>⠿</span>
                  <div className="edmain">
                    {arming === i ? <span className="tag rmtag">Will be removed · tap Remove again</span> : tag && <span className="tag">{tag}</span>}
                    <b>{slotSummary(cfg, sl)}</b>
                    <span className="note">{sl.items.map(it => [it.ph ? PHASES[it.ph].label : 'No phase', it.w != null ? it.w + ' lb' : (it.bw ? 'bodyweight' : ''), it.rx || ''].filter(Boolean).join(' · ')).join('  |  ')}</span>
                  </div>
                  <div className="edbtns">
                    <button type="button" className="btn sm" id={`up-${sl.id}`} aria-label={`Move ${slotSummary(cfg, sl)} up`} disabled={i === 0} onClick={() => st.moveEdSlot(i, -1)}><Icon name="arrow-up" /></button>
                    <button type="button" className="btn sm" id={`down-${sl.id}`} aria-label={`Move ${slotSummary(cfg, sl)} down`} disabled={i === day.slots.length - 1} onClick={() => st.moveEdSlot(i, 1)}><Icon name="arrow-down" /></button>
                    {daySelect(sl, i, slotSummary(cfg, sl))}
                    <button type="button" className="btn sm" id={`mvp-${sl.id}`} aria-label={`Move ${slotSummary(cfg, sl)} to another program or day`} onClick={() => { if (!st.blocked()) st.openModal({ type: 'moveprog', idx: i }); }}>Move…</button>
                    <button type="button" className="btn sm" id={`edit-${sl.id}`} aria-label={`Edit ${slotSummary(cfg, sl)}`} onClick={() => { if (!st.blocked()) st.openModal({ type: 'slot', idx: i }); }}>Edit</button>
                    <ArmedButton className={`btn sm ${arming === i ? 'danger' : 'ghost'}`} id={`rm-${sl.id}`} aria-label={`Remove ${slotSummary(cfg, sl)}`} label="Remove" armedLabel="Tap again to remove" onArmedChange={a => setArming(a ? i : null)} onConfirm={() => { setArming(null); justRemoved.current = true; st.removeEdSlot(i); }} />
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
      </section>
      <p className="note mt-12">
        {lib ? 'Changes are saved to this library program only. Nothing on the board changes until you load it into A or B.' : `Changes apply to every week that uses ${progName(cfg, k)}. Your logged sets stay as they are.`}
      </p>
      {lib ? <LibItemPanel it={item} /> : <Library k={k} custom={custom} />}
    </>
  );
}

// The Program tab: the programs, and the exercise and stretch libraries (supplements are on Daily → Supplements, under Edit).
export default function Editor() {
  // The view is in the address (#/program/exercises); the segmented control swaps it instead of adding a Back step.
  const page = pageOf(useRoutePath(), 'program');
  const view = page === 'a' || page === 'b' ? 'program' : page ?? 'program';
  const setView = (v: string) => navigate(v === 'program' ? 'program' : `program/${v}`, 'replace');
  return (
    <>
      <div className="edtop">
        <div className="seg" role="group" aria-label="Program tab view">
          <button type="button" className={view === 'program' ? 'on' : ''} aria-pressed={view === 'program'} onClick={() => setView('program')}>Programs</button>
          <button type="button" className={view === 'exercises' ? 'on' : ''} aria-pressed={view === 'exercises'} onClick={() => setView('exercises')}>Exercise library</button>
          <button type="button" className={view === 'stretches' ? 'on' : ''} aria-pressed={view === 'stretches'} onClick={() => setView('stretches')}>Stretch library</button>
        </div>
      </div>
      {view === 'program' ? <ProgramEditor /> : view === 'stretches' ? <StretchLibrary /> : <ExerciseLibrary />}
    </>
  );
}
