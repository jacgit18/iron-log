import './DetailSheet.css';
import type { LogEntry } from '../../types.ts';
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, exInfo } from '../../lib/data.js';
import { parseDate, fmtShort } from '../../shared/dates.js';
import { volText, AUTO_NOTE } from '../../lib/logic.js';
import { entryId, findEntry } from '../../lib/export.js';
import Sheet from '../Sheet.jsx';
import ArmedButton from '../ArmedButton.jsx';
import LineChart from '../LineChart.js';
import RemovedNotice from '../RemovedNotice.jsx';
import LiftGoal from '../progress/LiftGoal.jsx';
import EditEntry from './EditEntry.jsx';
import './SetRows.css';

export default function DetailSheet({ exId }: { exId: string }) {
  const cfg = useAppStore(s => s.cfg);
  const L = useAppStore(s => s.logs[exId]) || [];
  const { deleteLog, closeModal } = useAppStore.getState();
  const [editing, setEditing] = useState<LogEntry | null>(null); // the entry as it was when Edit was tapped
  const [arming, setArming] = useState<string | null>(null); // the row whose ✕ was pressed once
  const editOpen = editing && findEntry(L, editing) >= 0; // gone or changed meanwhile: the form closes
  const last = L[L.length - 1];
  const multi = new Set(L.map(e => e.ph || null)).size > 1;

  return (
    <Sheet className="maxw-640">
      <h2 className="cond">{exInfo(cfg, exId).n}</h2>
      {last && (
        <>
          <p className="note">
            {multi ? 'One line per phase you train this lift in. Tap a point for the date and weight.' : `${last.ph ? PHASES[last.ph].label : 'No phase'} trend.`} The table lists every session.
          </p>
          <LineChart entries={L} height={200} byPhase={multi} />
        </>
      )}
      <LiftGoal exId={exId} />
      {editOpen && <EditEntry key={entryId(editing)} exId={exId} entry={editing} onDone={() => setEditing(null)} />}
      <RemovedNotice scope={'log:' + exId} />
      <table className="hist hist-stack" role="table">
        <thead role="rowgroup"><tr role="row"><th role="columnheader">Date</th><th role="columnheader">Phase</th><th role="columnheader" className="num">Load</th><th role="columnheader" className="num">Volume</th><th role="columnheader">Note</th><th role="columnheader"><span className="sr">Edit or delete</span></th></tr></thead>
        <tbody role="rowgroup">
          {L.map((e, i) => ({ e, i })).reverse().map(({ e, i }) => (
            <tr role="row" key={`${entryId(e)}-${i}`} className={arming === `${entryId(e)}-${i}` ? 'removing' : undefined}>
              <td role="cell" className="rmname">{fmtShort(parseDate(e.d))}</td>
              <td role="cell">{e.ph ? PHASES[e.ph].label : '—'}</td>
              <td role="cell" className="num">{e.w != null && (e.w as unknown) !== '' ? `${e.w} lb` : 'Bodyweight'}</td>
              <td role="cell" className="num">{volText(e)}</td>
              <td role="cell">{e.n || (e.auto ? AUTO_NOTE : '')}</td>
              <td role="cell" className="nowrap">
                <button type="button" className="btn sm ghost" aria-label={`Edit entry from ${fmtShort(parseDate(e.d))}`} onClick={() => setEditing(e)}>Edit</button>{' '}
                <ArmedButton className={`btn sm ${arming === `${entryId(e)}-${i}` ? 'danger' : 'ghost'}`} aria-label={`Delete entry from ${fmtShort(parseDate(e.d))}`} label="✕" armedLabel="Delete?" onArmedChange={a => setArming(a ? `${entryId(e)}-${i}` : null)} onConfirm={() => { setArming(null); setEditing(null); deleteLog(exId, e); }} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions"><button type="button" className="btn" onClick={closeModal}>Close</button></div>
    </Sheet>
  );
}
