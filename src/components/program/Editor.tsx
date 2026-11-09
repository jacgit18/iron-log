import type { LibraryItem, Program, ProgramSlot } from '../../types.ts';
import type { EdMoved } from '../../store/types.ts';
import type { ProgKey } from '../../types.ts';
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { progName, DAYS } from '../../lib/logic.js';
import { exInfo } from '../../lib/data.js';
import { dayPickLabel, exerciseCount } from '../../lib/exerciseCount.js';
import { slotSummary } from '../../lib/programMove.js';
import { itemFacts, rolePill, sectionNote, supersetRuns, SUPERSET_NOTE } from '../../lib/programRowFacts.js';
import { fmtShort, parseDate, weekStartOf, ymd } from '../../shared/dates.js';
import ArmedButton from '../ArmedButton.jsx';
import CommitInput from '../CommitInput.jsx';
import DaySummary from './DaySummary.jsx';
import Icon from '../Icon.jsx';
import ExerciseLibrary from './ExerciseLibrary.jsx';
import ProgramCompare from './ProgramCompare.jsx';
import SavedPrograms from './SavedPrograms.jsx';
import ProgramFab from './ProgramFab.jsx';
import ProgramGuide from './ProgramGuide.jsx';
import ProgramHeader from './ProgramHeader.jsx';
import StretchLibrary from './StretchLibrary.jsx';
import { shiftOf, useDragReorder } from './useDragReorder.js';
import { pageOf, programKey, programPath } from '../../lib/route.js';
import { navigate, useRoutePath } from '../useRoute.js';
import { useWide } from './useWide.js';
import './Editor.css';


// Where a moved card went, for the Moved notice and its Go to button: a day title in this program, or the other program and its day.
const movedWhere = (m: EdMoved, prog: { days: { title: string }[] }) => (m.toKey ? `${m.toLabel} · Day ${m.to}` : prog.days[m.to - 1]!.title);


function LibItemPanel({ it }: { it: LibraryItem }) {
  const cfg = useAppStore(s => s.cfg); const st = useAppStore.getState();
  return (
    <section className="panel edpanel edprog lib mt-16">
      <h2>Put it on your Board</h2>
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
  const sheetOpen = useAppStore(s => s.modal !== null);
  // The A or B address left behind when a library program opened. It is dropped (below), and not taken as a request to show that program, when a closing sheet's
  // history entry brings it back: the create sheet's "Not yet" opens the new program while the sheet is still up, and popping the sheet restores the old address.
  const left = useRef<string | null>(null);
  useEffect(() => { if (named && named !== k && !(left.current && named === left.current)) st.setEdProg(named); }, [named]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const changed = prevK.current !== null && prevK.current !== k; prevK.current = k;
    const to = programPath(k);
    if (to) { left.current = null; if (path === 'program' || changed) navigate(to, 'replace'); return; }
    if (changed) left.current = named ?? left.current;
    if (named && named === left.current && !sheetOpen) navigate('program', 'replace'); // a library program is open: the address no longer names A or B
  }, [k, path, sheetOpen]); // eslint-disable-line react-hooks/exhaustive-deps
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
  const removed = useAppStore(s => s.edRemoved);
  const showRemoved = removed && removed.key === k && removed.day === edDay ? removed : null;
  // The row (and its Remove in the ⋯ sheet) is gone, so put focus on Undo. The notice is cleared when the editor unmounts, so it only shows after a Remove made in this visit.
  const undoRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (removed) undoRef.current?.focus(); }, [removed]);
  // The Undo belongs to this visit to the editor: leaving the Program tab drops it.
  useEffect(() => () => { useAppStore.getState().dismissEdRemoved(); }, []);
  // Same for the Moved notice. Its Go to button opens the day the card went to and puts focus on that card's ⋯ button.
  const moved = useAppStore(s => s.edMoved);
  const showMoved = moved && moved.key === k && moved.from === edDay ? moved : null;
  const copied = useAppStore(s => s.edCopied);
  const showCopied = copied && copied.key === k && copied.from === edDay ? copied : null;
  const [copyPick, setCopyPick] = useState<number | null>(null);
  const copyTo = copyPick != null && copyPick !== edDay ? copyPick : DAYS.find(d => d !== edDay)!; // a day other than the open one
  const copiedUndoRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (copied) copiedUndoRef.current?.focus(); }, [copied]);
  const movedUndoRef = useRef<HTMLButtonElement>(null);
  const focusAfterGo = useRef<string | null>(null);
  // A move that happened (from the ⋯ sheet or the Move to another program sheet) leaves the moved row behind: focus goes to Undo.
  useEffect(() => { if (moved) movedUndoRef.current?.focus(); }, [moved]);
  useEffect(() => { if (focusAfterGo.current) { document.getElementById(focusAfterGo.current)?.focus(); focusAfterGo.current = null; } }, [edDay, k]);
  useEffect(() => () => { const s = useAppStore.getState(); s.dismissEdMoved(); s.dismissEdCopied(); }, []);
  // A phone folds the Day label field and the Copy this day controls behind two small buttons; they open for the day and program they were opened on.
  const wide = useWide(); const dayKey = `${k}:${edDay}`;
  const [labelOpenFor, setLabelOpenFor] = useState<string[]>([]); const [copyOpenFor, setCopyOpenFor] = useState<string | null>(null);
  const labelOpen = labelOpenFor.includes(dayKey); const copyOpen = copyOpenFor === dayKey;
  const addBtn = <button type="button" className={`btn primary${wide ? '' : ' addfull'}`} onClick={() => { if (!st.blocked()) st.openModal({ type: 'slot', idx: null }); }}>+ Add exercise</button>;

  return (
    <>
      <ProgramGuide />
      <ProgramHeader k={k} name={edName} prog={prog} lib={lib} />
      <div className="edtop">
        {wide ? (
          <div className="dtabs" role="group" aria-label="Jump to day">
            {DAYS.map(d => {
              const n = exerciseCount(prog.days[d - 1]?.slots ?? []);
              return <button type="button" key={d} className={d === edDay ? 'on' : ''} aria-pressed={d === edDay} onClick={() => st.setEdDay(d)}>Day {d}<small>{n ? `${n} ${n === 1 ? 'exercise' : 'exercises'}` : 'rest'}</small></button>;
            })}
          </div>
        ) : (
          <div className="dayctl">
            <div className="daystep" role="group" aria-label="Day stepper">
              <button type="button" className="btn daystepbtn" aria-label="Previous day" aria-disabled={edDay === 1} onClick={() => { if (edDay > 1) st.setEdDay(edDay - 1); }}><Icon name="chevron-left" /></button>
              <select className="btn daypick" aria-label="Day to edit" value={edDay} onChange={e => st.setEdDay(Number(e.target.value))}>
                {DAYS.map(d => <option key={d} value={d}>{dayPickLabel(d, DAYS.length, exerciseCount(prog.days[d - 1]?.slots ?? []))}</option>)}
              </select>
              <button type="button" className="btn daystepbtn" aria-label="Next day" aria-disabled={edDay === DAYS.length} onClick={() => { if (edDay < DAYS.length) st.setEdDay(edDay + 1); }}><Icon name="chevron-right" /></button>
            </div>
          </div>
        )}
      </div>
      {lib ? (
        <>
          <div className="notice tip libnote"><span><b>{item.name}</b> is in your library, not on your Board. Build it here, then load it into {progName(cfg, 'A')} or {progName(cfg, 'B')} when you're ready to train it.</span></div>
          <label className="field progname">Program name
            <CommitInput key={`L${item.id}:${item.name}`} id="prog-name" maxLength={60} value={item.name} onCommit={st.renameLibItem} />
          </label>
        </>
      ) : null}
      <div className="edcols">
      <section className="panel edpanel edprog">
        <div className="inline flexwrap edheadrow"><h2 id="ed-title" tabIndex={-1} className="mr-auto">{edName} · {day.title}</h2>
          {wide && (
            <div className="edtools">
              {day.slots.length > 0 && !copyOpen && <button type="button" className="btn" onClick={() => setCopyOpenFor(dayKey)}>Copy day…</button>}
              {addBtn}
            </div>
          )}
        </div>
        {wide || day.sub || labelOpen ? (
          <label className="field">Day label
            <CommitInput key={`${k}:${edDay}:${day.sub || ''}`} id="ed-sub" value={day.sub || ''} placeholder="e.g. Lower body + reactive power" onCommit={st.setDaySub} autoFocus={!wide && labelOpen && !day.sub} />
          </label>
        ) : null}
        <div className={`actions edadd start${wide ? ' wideadd' : ' compact'}`}>
          {!wide && addBtn}
          {!wide && (
            <div className="edsmall">
              {!(day.sub || labelOpen) && <button type="button" className="btn sm ghost" onClick={() => setLabelOpenFor(o => [...o, dayKey])}>Add a day label</button>}
              {day.slots.length > 0 && !copyOpen && <button type="button" className="btn sm ghost" onClick={() => setCopyOpenFor(dayKey)}>Copy day…</button>}
            </div>
          )}
          {day.slots.length > 0 && copyOpen && (
            <span className="copyday">
              <label className="field">Copy this day to
                <select className="btn" value={copyTo} onChange={e => setCopyPick(Number(e.target.value))}>
                  {DAYS.filter(d => d !== edDay).map(d => <option key={d} value={d}>{dayPickLabel(d, DAYS.length, exerciseCount(prog.days[d - 1]?.slots ?? []))}</option>)}
                </select>
              </label>
              <button type="button" className="btn" onClick={() => st.copyEdDay(copyTo)}>Copy</button>
            </span>
          )}
        </div>
        {showCopied && (
          <div className="notice movewarn removednote" role="status">
            <div><b>Copied</b> {showCopied.ids.length === 1 ? '1 card' : `${showCopied.ids.length} cards`} from {day.title} to {prog.days[showCopied.to - 1]!.title}.</div>
            <div className="actions">
              <button type="button" className="btn sm" ref={copiedUndoRef} onClick={st.undoCopyEdDay}>Undo</button>
              <button type="button" className="btn sm" onClick={() => { st.setEdDay(showCopied.to); }}>Go to {prog.days[showCopied.to - 1]!.title}</button>
              <button type="button" className="btn sm ghost" onClick={st.dismissEdCopied}>Dismiss</button>
            </div>
          </div>
        )}
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
              <button type="button" className="btn sm" onClick={() => { focusAfterGo.current = showMoved.slot.id ? `more-${showMoved.slot.id}` : null; if (showMoved.toKey) st.setEdProg(showMoved.toKey); st.setEdDay(showMoved.to); }}>Go to {movedWhere(showMoved, prog)}</button>
              <button type="button" className="btn sm ghost" onClick={st.dismissEdMoved}>Dismiss</button>
            </div>
          </div>
        )}
        <div className="edlist">
          {!day.slots.length && <p className="note">No exercises on this day yet.</p>}
          {(() => {
            const runs = supersetRuns(day.slots); const runEnd = new Map(runs);
            const secHead = (i: number) => (i === 0 || day.slots[i].sec !== day.slots[i - 1].sec ? <div className="sect" key={`sec${i}`}>{day.slots[i].sec || ''}{sectionNote(day.slots[i].sec) && <span className="sectnote">{sectionNote(day.slots[i].sec)}</span>}</div> : null);
            const row = (sl: ProgramSlot, i: number, noSec = false) => {
              const newSec = !noSec && (i === 0 || sl.sec !== day.slots[i - 1].sec);
              const starts = sl.from && sl.from > thisWeek ? `Starts ${fmtShort(parseDate(sl.from))}` : ''; // added to a finished day: not on the board until then
              const role = rolePill(sl); const multi = sl.items.length > 1; const note = sectionNote(sl.sec);
              return (
                <Fragment key={sl.id || i}>
                  {newSec && <div className="sect">{sl.sec || ''}{note && <span className="sectnote">{note}</span>}</div>}
                  <div
                    ref={rowRef(i)}
                    className={`edrow${drag?.from === i ? ' dragging' : drag ? ' shifting' : ''}`}
                    style={drag ? { transform: `translateY(${drag.from === i ? drag.dy : shiftOf(drag, i)}px)` } : undefined}
                  >
                    <span className="draghandle" aria-hidden="true" title="Drag to reorder" {...handleProps(i)}>⠿</span>
                    <div className="edmain">
                      <b>{slotSummary(cfg, sl)}</b>
                      {(() => {
                        // One exercise: its facts share the line with the pills. Two or more (a superset, an either/or): a line each, led by the exercise's name.
                        const lines = sl.items.map((it, n) => ({ it, n, f: itemFacts(it) })).filter(x => multi || x.f.facts || x.f.phase);
                        const tags = (role || sl.type === 'either' || starts) ? (
                          <>
                            {role && <span className={`pill rolepill${role === 'Main lift' ? ' main' : ''}`}>{role}</span>}
                            {sl.type === 'either' && <span className="pill">Either / or</span>}
                            {starts && <span className="pill">{starts}</span>}
                          </>
                        ) : null;
                        const line = ({ it, f }: (typeof lines)[number]) => (
                          <>
                            {multi && <span className="exitem">{exInfo(cfg, it.ex).n}</span>}
                            {f.facts && <span className="fact">{f.facts}</span>}
                            {f.phase && <span className="pill phpill" data-p={f.phaseKey}>{f.phase}</span>}
                          </>
                        );
                        if (!multi) return tags || lines.length ? <span className="exfacts">{tags}{lines[0] && line(lines[0])}</span> : null;
                        return <>{tags && <span className="exfacts">{tags}</span>}{lines.map(x => <span className="exfacts" key={x.n}>{line(x)}</span>)}</>;
                      })()}
                    </div>
                    <div className="edbtns">
                      <button type="button" className="btn sm" id={`edit-${sl.id}`} aria-label={`Edit ${slotSummary(cfg, sl)}`} onClick={() => { if (!st.blocked()) st.openModal({ type: 'slot', idx: i }); }}>Edit</button>
                      <button type="button" className="btn sm" id={`more-${sl.id}`} aria-label={`More actions for ${slotSummary(cfg, sl)}`} aria-haspopup="dialog" onClick={() => { if (!st.blocked()) st.openModal({ type: 'rowmenu', idx: i }); }}>⋯</button>
                    </div>
                  </div>
                </Fragment>
              );
            };
            const out: ReactNode[] = [];
            for (let i = 0; i < day.slots.length;) {
              const end = runEnd.get(i);
              if (end === undefined) { out.push(row(day.slots[i], i)); i++; continue; }
              const inner: ReactNode[] = [];
              for (let n = i; n <= end; n++) inner.push(row(day.slots[n], n, n === i)); // the run's first section label sits above the box, not in it
              out.push(secHead(i));
              out.push(<div className="ssgroup" role="group" aria-label="Superset" key={`ss${i}`}><div className="ssgh"><span className="pill ssbadge">Superset</span><span className="note">{SUPERSET_NOTE}</span></div>{inner}</div>);
              i = end + 1;
            }
            return out;
          })()}
        </div>
      </section>
      <DaySummary day={day} dayNo={edDay} />
      <p className="note mt-12">
        {lib ? 'Changes are saved to this library program only. Nothing on the board changes until you load it into A or B.' : `Changes apply to every week that uses ${progName(cfg, k)}. Your logged sets stay as they are.`}
      </p>
      {lib && <LibItemPanel it={item} />}
      {!wide && <ProgramCompare />}
      {!wide && !lib && <SavedPrograms k={k} custom={custom} />}
      </div>
      <ProgramFab />
    </>
  );
}

// A desktop has room for five views; a phone keeps three (Saved programs and Compare programs stay on Programs there, brief program-tab-desktop-layout).
const SECTIONS_WIDE = [['program', 'Programs', 'Your weekly program, day by day'], ['exercises', 'Exercises', 'Every exercise you can use'], ['stretches', 'Stretches', 'Stretches you can add'], ['saved', 'Saved', 'Programs you keep'], ['compare', 'Compare', 'Two programs side by side']] as const;
const SECTIONS_PHONE = [['program', 'Programs', 'Your weekly program, day by day'], ['exercises', 'Exercises', 'Every exercise you can use'], ['stretches', 'Stretches', 'Stretches you can add']] as const;

// The program a view that is not the editor still shows in its header: the one being edited, with the A | B switch and Create a program.
function ProgramViewHeader() {
  const cfg = useAppStore(s => s.cfg); const programs = useAppStore(s => s.programs);
  const k = useAppStore(s => s.edKey()); const item = useAppStore(s => s.edItem());
  const prog = item ? item.prog : programs[k];
  return <ProgramHeader k={k} name={item ? item.name : progName(cfg, k)} prog={prog} lib={!!item} />;
}

// The Saved view: the Save a copy form, a search and the list of saved programs (desktop).
function SavedView() {
  const edKey = useAppStore(s => s.edKey()); const programs = useAppStore(s => s.programs);
  const k = edKey === 'A' || edKey === 'B' ? edKey : 'A'; // a saved program open in the editor is not a slot: Save a copy and Put on Board work on a Board program
  useEffect(() => { if (edKey !== 'A' && edKey !== 'B') useAppStore.getState().setEdProg('A'); }, [edKey]); // the store's Save a copy reads the open program, so this view opens on A, not on the saved program that was being edited
  const custom = !useAppStore.getState().isOriginal(programs[k] as Program, k as ProgKey);
  return <><ProgramViewHeader /><SavedPrograms k={k} custom={custom} tab /></>;
}

// The Program tab: the programs, and the exercise and stretch libraries (supplements are on Daily → Supplements, under Edit).
export default function Editor() {
  // The view is in the address (#/program/exercises); the segmented control swaps it instead of adding a Back step.
  const page = pageOf(useRoutePath(), 'program');
  const wide = useWide();
  const SECTIONS = wide ? SECTIONS_WIDE : SECTIONS_PHONE;
  const asked = page === 'a' || page === 'b' ? 'program' : page ?? 'program';
  const view = SECTIONS.some(([v]) => v === asked) ? asked : 'program'; // a phone has no Saved or Compare view: those addresses show Programs
  const setView = (v: string) => navigate(v === 'program' ? 'program' : `program/${v}`, 'replace');
  return (
    <>
      <div className="sectabs" role="group" aria-label="Program tab view">
        {SECTIONS.map(([v, label, text]) => (
          <button type="button" key={v} className={view === v ? 'on' : ''} aria-pressed={view === v} aria-describedby={`sectab-${v}`} onClick={() => setView(v)}><b>{label}</b><span id={`sectab-${v}`} aria-hidden="true">{text}</span></button>
        ))}
      </div>
      {view === 'program' ? <ProgramEditor /> : view === 'stretches' ? <StretchLibrary /> : view === 'saved' ? <SavedView /> : view === 'compare' ? <><ProgramViewHeader /><ProgramCompare page /></> : <ExerciseLibrary />}
    </>
  );
}
