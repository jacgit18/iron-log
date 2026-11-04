import type { LibraryItem, PhaseKey, Program } from '../../types.ts';
import { useId, useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, PH_KEYS, exInfo } from '../../lib/data.js';
import { DAYS, progName } from '../../lib/logic.js';
import { splitLibrary } from '../../lib/programArchive.js';
import {
  compareProgram, countRows, diffNote, filterRows, loadLine, phaseMix, phaseOf,
  type CompareRow, type CompareStatus, type PhaseFilter, type StatusFilter,
} from '../../lib/programCompare.js';
import './ProgramCompare.css';

const STATUS_TAG: Record<CompareStatus, string> = { same: 'Same', chg: 'Changed', ph: 'Phase differs', onlyA: 'Only here', onlyB: 'Only here' };
const phKey = (p: PhaseKey | null) => p ?? 'none';
const phName = (p: PhaseKey | null) => (p ? PHASES[p].label : 'No phase');

function Pill({ ph }: { ph: PhaseKey | null }) {
  return <span className={`cmpph cmpph-${phKey(ph)}`}>{phName(ph)}</span>;
}

// One program as a board of rows. The rows are the editor's own (`.edrow`) without drag handle or buttons: nothing here can be edited.
function Board({ name, side, rows }: { name: string; side: 'left' | 'right'; rows: CompareRow[] }) {
  const cfg = useAppStore(st => st.cfg);
  const other = side === 'left' ? 'right' : 'left';
  const mine = rows.filter(r => r[side]);
  return (
    <section className="cmpboard" aria-label={name}>
      <h3>{name}</h3>
      <div className="edlist">
        {!mine.length && <p className="note">Nothing to show here for this day and filter.</p>}
        {mine.map((r, i) => {
          const it = r[side]!;
          const away = side === 'left' ? r.status === 'onlyA' : r.status === 'onlyB';
          const note = side === 'left' && r[other] ? diffNote(r) : '';
          return (
            <div key={i} className={`edrow cmprow cmp-${away ? 'only' : r.status}`}>
              <div className="edmain">
                <span className="tag">{away ? 'Only here' : STATUS_TAG[r.status]}</span>
                <b>{exInfo(cfg, it.ex).n}</b>
                <span className="note"><Pill ph={it.ph} />{loadLine(it) && ` ${loadLine(it)}`}</span>
                {note && <span className="note cmphint">Other program: {note}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
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
  const active = splitLibrary(library).active;
  const a = sel(programs, library, one) ?? sel(programs, library, 'A')!; const b = sel(programs, library, two) ?? sel(programs, library, 'B')!;
  const nameOf = (s: { name: string }) => (s.name === 'A' || s.name === 'B' ? progName(cfg, s.name) : s.name);
  const an = nameOf(a); const bn = nameOf(b);
  const same = a.prog === b.prog || one === two;
  const days = compareProgram(a.prog, b.prog);
  const dayRows = days[day - 1] ?? [];
  const counts = countRows(dayRows);
  const shown = filterRows(dayRows, status, phase);
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
            {DAYS.slice(0, days.length).map(d => {
              const n = countRows(days[d - 1] ?? []).diff;
              return <button type="button" key={d} className="btn sm cmpday" aria-pressed={d === day} onClick={() => setDay(d)}>Day {d}<small>{n ? ` · ${n} differ` : ''}</small></button>;
            })}
          </div>
          <div className="cmpchips" role="group" aria-label="Show rows">
            {chips.map(([k, label, n]) => <button type="button" key={k} className="btn sm cmpchip" aria-pressed={status === k} onClick={() => setStatus(k)}>{label} {n}</button>)}
          </div>
          <div className="cmpchips" role="group" aria-label="Phase">
            <button type="button" className="btn sm cmpchip" aria-pressed={phase === null} onClick={() => setPhase(null)}>Any phase</button>
            {phases.map(k => <button type="button" key={k} className="btn sm cmpchip" aria-pressed={phase === k} onClick={() => setPhase(k)}>{PHASES[k].label}</button>)}
            {hasNone && <button type="button" className="btn sm cmpchip" aria-pressed={phase === 'none'} onClick={() => setPhase('none')}>No phase</button>}
          </div>
          {!dayRows.length ? <p className="note" role="status">Nothing on this day in either program.</p> : (
            <div className="cmpboards">
              <Board name={an} side="left" rows={shown} />
              <Board name={bn} side="right" rows={shown} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

// The Program tab's last section: two programs stacked, compared day by day. Read-only; it never touches the store's programs or the editor's day.
export default function ProgramCompare() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <section className="panel cmppanel">
      <h2 className="cmphead">
        <button type="button" className="cmptoggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(o => !o)}>Compare programs</button>
      </h2>
      <div id={id} hidden={!open}>{open && <Panel />}</div>
    </section>
  );
}
