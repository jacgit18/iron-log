import type { Program, ProgramDay } from '../../types.ts';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES } from '../../lib/data.js';
import { daySummary } from '../../lib/daySummary.js';
import { fmtSets } from '../../lib/muscles.js';
import './DaySummary.css';

// Wide desktop only (the stylesheet hides it below 1280px): what the open day of the program holds. Planned from the cards, never from the log.
export default function DaySummary({ day, prog, dayNo }: { day: ProgramDay; prog: Program; dayNo: number }) {
  const cfg = useAppStore(s => s.cfg);
  const sm = daySummary(cfg, prog.days[dayNo - 1] ?? day);
  const top = sm.muscles[0]?.sets || 1;
  return (
    <section className="panel daysum" aria-label={`Day ${dayNo} at a glance`}>
      <h2>Day {dayNo} at a glance</h2>
      {day.sub && <p className="note daysum-sub">{day.sub}</p>}
      <div className="daysum-strip">
        <div><b>{sm.exercises}</b><span>{sm.exercises === 1 ? 'exercise' : 'exercises'}</span></div>
        <div><b>{sm.sets}</b><span>{sm.sets === 1 ? 'set' : 'sets'}</span></div>
      </div>
      {sm.phases.length > 0 && (
        <>
          <h3>Phase mix</h3>
          <div className="daysum-phbar" role="img" aria-label={sm.phases.map(p => `${PHASES[p.key].label} ${p.count}`).join(', ')}>
            {sm.phases.map(p => <i key={p.key} data-p={p.key} style={{ flexGrow: p.count }} />)}
          </div>
          <ul className="daysum-legend">
            {sm.phases.map(p => <li key={p.key}><span className="dot" data-p={p.key} aria-hidden="true" />{PHASES[p.key].label} {p.count}</li>)}
          </ul>
        </>
      )}
      {sm.muscles.length > 0 && (
        <>
          <h3>Muscles hit · planned sets</h3>
          <ul className="daysum-muscles">
            {sm.muscles.map(m => (
              <li key={m.key}>
                <span>{m.name}</span>
                <span className="daysum-track" aria-hidden="true"><i style={{ width: `${Math.round(m.sets / top * 100)}%` }} /></span>
                <b>{fmtSets(m.sets)}</b>
              </li>
            ))}
          </ul>
          {sm.moreMuscles > 0 && <p className="note">and {sm.moreMuscles} more</p>}
        </>
      )}
      {sm.equipment.length > 0 && (
        <>
          <h3>Equipment</h3>
          <ul className="daysum-equip">
            {sm.equipment.map(e => <li key={e.id} className="chip">{e.name} · {e.count}</li>)}
          </ul>
        </>
      )}
      {sm.exercises === 0 && <p className="note">No exercises on this day yet.</p>}
      <p className="note">Planned from this day, not logged.</p>
    </section>
  );
}
