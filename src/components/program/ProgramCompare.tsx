import type { LibraryItem, PhaseKey, Program } from '../../types.ts';
import { useId, useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import Icon from '../Icon.jsx';
import { PHASES, PH_KEYS, exInfo } from '../../lib/data.js';
import { DAYS, progName } from '../../lib/logic.js';
import { splitLibrary } from '../../lib/programArchive.js';
import {
  compareProgram, compareSections, countRows, diffParts, loadLine, phaseMix, phaseOf, rowTag,
  type CompareRow, type PhaseFilter, type StatusFilter,
} from '../../lib/programCompare.js';
import './ProgramCompare.css';

const phKey = (p: PhaseKey | null) => p ?? 'none';
const phName = (p: PhaseKey | null) => (p ? PHASES[p].label : 'No phase');

function Pill({ ph, hot }: { ph: PhaseKey | null; hot?: boolean }) {
  return <span className={`cmpph cmpph-${phKey(ph)}${hot ? ' cmpph-hot' : ''}`}>{phName(ph)}</span>;
}

// One program's side of a row: its load and phase, with what differs from the other side marked, or a note that the exercise is not in it.
// The program's name is the label on a narrow panel (A over B); on a wide one the column heading carries it and this stays for screen readers.
function Side({ who, it, markLoad, markPhase }: { who: string; it: CompareRow['left']; markLoad: boolean; markPhase: boolean }) {
  return (
    <div className="cmpside">
      <span className="cmpwho">{who}</span>
      {it ? (
        <span className="cmpval">
          {loadLine(it) && <span className={markLoad ? 'cmpdiff' : undefined}>{loadLine(it)}</span>}
          <Pill ph={it.ph} hot={markPhase} />
        </span>
      ) : <span className="note cmpmiss">Not in this program</span>}
    </div>
  );
}

// Both programs in one list, each exercise once with the first program's line over the second's (side by side when the panel is wide). The rows are the
// editor's own (`.edrow`) without drag handle or buttons: nothing here can be edited.
function Aligned({ an, bn, rows, heading }: { an: string; bn: string; rows: CompareRow[]; heading?: string }) {
  const cfg = useAppStore(st => st.cfg);
  return (
    <div className="edlist cmpaligned">
      {heading && <h3 className="cmpdayhead">{heading}</h3>}
      <div className="cmpcols" aria-hidden="true"><span /><b>{an}</b><b>{bn}</b></div>
      {!rows.length && <p className="note">Nothing to show here for this day and filter.</p>}
      {rows.map((r, i) => {
        const away = r.status === 'onlyA' || r.status === 'onlyB';
        const diff = diffParts(r);
        return (
          <div key={i} className={`edrow cmprow cmp-${away ? 'only' : r.status}`}>
            <div className="cmpname"><b>{exInfo(cfg, (r.left ?? r.right)!.ex).n}</b><span className="tag">{rowTag(r, an, bn)}</span></div>
            <Side who={an} it={r.left} markLoad={diff.load} markPhase={diff.phase} />
            <Side who={bn} it={r.right} markLoad={diff.load} markPhase={diff.phase} />
          </div>
        );
      })}
    </div>
  );
}

function Mix({ name, p }: { name: string; p: Program }) {
  const mix = phaseMix(p);
  const keys = [...PH_KEYS, 'none' as const].filter(k => mix[k] > 0);
  const total = keys.reduce((n, k) => n + mix[k], 0);
  return (
    <div className="cmpmix">
      <b>{name}</b>
      <div className="cmpbar" aria-hidden="true">{keys.map(k => <span key={k} className={`cmpph-${k}`} style={{ flexGrow: mix[k] }} />)}</div>
      <span className="note">{total ? keys.map(k => `${k === 'none' ? 'No phase' : PHASES[k].label} ${mix[k]}`).join(' · ') : 'No exercises'}</span>
    </div>
  );
}

const sel = (progs: Record<string, Program>, library: LibraryItem[], key: string): { prog: Program; name: string } | null => {
  if (key === 'A' || key === 'B') return progs[key] ? { prog: progs[key]!, name: key } : null;
  const it = library.find(l => 'L:' + l.id === key && !l.archived);
  return it ? { prog: it.prog, name: it.name } : null;
};

function Panel() {
  const cfg = useAppStore(s => s.cfg); const programs = useAppStore(s => s.programs); const library = useAppStore(s => s.library);
  const [one, setOne] = useState('A'); const [two, setTwo] = useState('B');
  const [day, setDay] = useState(() => useAppStore.getState().edDay);
  const [status, setStatus] = useState<StatusFilter>('all'); const [phase, setPhase] = useState<PhaseFilter>(null);
  const [filtersOpen, setFiltersOpen] = useState(false); // only matters on a narrow panel, where the filters fold behind a button (ProgramCompare.css)
  const filtersId = useId();
  const active = splitLibrary(library).active;
  const a = sel(programs, library, one) ?? sel(programs, library, 'A')!; const b = sel(programs, library, two) ?? sel(programs, library, 'B')!;
  const nameOf = (s: { name: string }) => (s.name === 'A' || s.name === 'B' ? progName(cfg, s.name) : s.name);
  const an = nameOf(a); const bn = nameOf(b);
  const same = a.prog === b.prog || one === two;
  const days = compareProgram(a.prog, b.prog);
  const dayRows = day === 0 ? days.flat() : (days[day - 1] ?? []); // day 0 is the All days view
  const counts0 = countRows(days.flat());
  const counts = day === 0 ? counts0 : countRows(dayRows);
  const sections = compareSections(days, day, status, phase);
  const filtersOn = (status !== 'all' ? 1 : 0) + (phase !== null ? 1 : 0);
  const phases: PhaseKey[] = PH_KEYS.filter(k => dayRows.some(r => phaseOf(r, 'left') === k || phaseOf(r, 'right') === k));
  const hasNone = dayRows.some(r => phaseOf(r, 'left') === null || phaseOf(r, 'right') === null);
  const options = (
    <>
      <option value="A">{progName(cfg, 'A')}</option>
      <option value="B">{progName(cfg, 'B')}</option>
      {active.map(it => <option key={it.id} value={'L:' + it.id}>{it.name}</option>)}
    </>
  );
  const chips: [StatusFilter, string, number][] = [
    ['all', 'All', counts.all], ['diff', 'Any difference', counts.diff], ['same', 'Same', counts.same], ['chg', 'Changed', counts.chg],
    ['ph', 'Phase differs', counts.ph], ['onlyA', `Only in ${an}`, counts.onlyA], ['onlyB', `Only in ${bn}`, counts.onlyB],
  ];
  return (
    <div className="cmpbody">
      <div className="cmppick">
        <label className="field">First program<select value={one} onChange={e => setOne(e.target.value)}>{options}</select></label>
        <label className="field">Second program<select value={two} onChange={e => setTwo(e.target.value)}>{options}</select></label>
      </div>
      {same ? <p className="note" role="status">Both sides are the same program.</p> : (
        <>
          <div className="cmpmixes"><Mix name={an} p={a.prog} /><Mix name={bn} p={b.prog} /></div>
          <div className="cmpdays" role="group" aria-label="Compare day">
            <button type="button" className="btn sm cmpday" aria-pressed={day === 0} onClick={() => { setDay(0); setPhase(null); }}>All days<small>{counts0.diff ? ` · ${counts0.diff} differ` : ''}</small></button>
            {DAYS.slice(0, days.length).map(d => {
              const n = countRows(days[d - 1] ?? []).diff;
              return <button type="button" key={d} className="btn sm cmpday" aria-pressed={d === day} onClick={() => { setDay(d); setPhase(null); }}>Day {d}<small>{n ? ` · ${n} differ` : ''}</small></button>;
            })}
          </div>
          <button type="button" className="btn sm cmpfilterbtn" aria-expanded={filtersOpen} aria-controls={filtersId} onClick={() => setFiltersOpen(o => !o)}>
            Filter{filtersOn ? ` · ${filtersOn} on` : ''}<span className="cmpchev" aria-hidden="true"><Icon name="chevron-down" /></span>
          </button>
          <div id={filtersId} className="cmpfilters" data-open={filtersOpen}>
            <div className="cmpchips" role="group" aria-label="Show rows">
              {chips.map(([k, label, n]) => <button type="button" key={k} className="btn sm cmpchip" aria-pressed={status === k} onClick={() => setStatus(k)}>{label} {n}</button>)}
            </div>
            <div className="cmpchips" role="group" aria-label="Phase">
              <button type="button" className="btn sm cmpchip" aria-pressed={phase === null} onClick={() => setPhase(null)}>Any phase</button>
              {phases.map(k => <button type="button" key={k} className="btn sm cmpchip" aria-pressed={phase === k} onClick={() => setPhase(k)}>{PHASES[k].label}</button>)}
              {hasNone && <button type="button" className="btn sm cmpchip" aria-pressed={phase === 'none'} onClick={() => setPhase('none')}>No phase</button>}
            </div>
          </div>
          {!dayRows.length ? <p className="note" role="status">{day === 0 ? 'Nothing in either program.' : 'Nothing on this day in either program.'}</p>
            : sections.some(sec => sec.rows.length) ? sections.map((sec, i) => <Aligned key={i} an={an} bn={bn} rows={sec.rows} heading={sec.heading} />)
            : <Aligned an={an} bn={bn} rows={[]} />}
        </>
      )}
    </div>
  );
}

// The Program tab's last section: two programs compared day by day, one row per exercise. Read-only; it never touches the store's programs or the editor's day.
export default function ProgramCompare() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className="panel cmppanel">
      <h2 className="cmphead">
        <button type="button" className="cmptoggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>Compare programs<span className="cmpchev" aria-hidden="true"><Icon name="chevron-down" /></span></button>
      </h2>
      <div id={id} hidden={!open}>{open && <Panel />}</div>
    </section>
  );
}
