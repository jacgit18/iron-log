import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, exInfo } from '../../lib/data.js';
import { parseDate, fmtShort } from '../../lib/dates.js';
import { volText, AUTO_NOTE } from '../../lib/logic.js';
import Sheet from '../Sheet.jsx';
import ArmedButton from '../ArmedButton.jsx';
import LineChart from '../LineChart.jsx';

export default function DetailSheet({ exId }) {
  const cfg = useAppStore(s => s.cfg);
  const L = useAppStore(s => s.logs[exId]) || [];
  const { deleteLog, closeModal } = useAppStore.getState();
  const last = L[L.length - 1];
  const multi = new Set(L.map(e => e.ph || null)).size > 1;

  return (
    <Sheet style={{ maxWidth: 640 }}>
      <h2 className="cond">{exInfo(cfg, exId).n}</h2>
      {last && (
        <>
          <p className="note">
            {multi ? 'One line per phase you train this lift in. Tap a point for the date and weight.' : `${last.ph ? PHASES[last.ph].label : 'No phase'} trend.`} The table lists every session.
          </p>
          <LineChart entries={L} height={200} byPhase={multi} />
        </>
      )}
      <table className="hist">
        <thead><tr><th>Date</th><th>Phase</th><th className="num">Load</th><th className="num">Volume</th><th>Note</th><th><span className="sr">Delete</span></th></tr></thead>
        <tbody>
          {L.map((e, i) => ({ e, i })).reverse().map(({ e, i }) => (
            <tr key={`${i}-${e.d}`}>
              <td>{fmtShort(parseDate(e.d))}</td>
              <td>{e.ph ? PHASES[e.ph].label : '—'}</td>
              <td className="num">{e.w != null && e.w !== '' ? `${e.w} lb` : 'Bodyweight'}</td>
              <td className="num">{volText(e)}</td>
              <td>{e.n || (e.auto ? AUTO_NOTE : '')}</td>
              <td><ArmedButton className="btn sm ghost" aria-label={`Delete entry from ${fmtShort(parseDate(e.d))}`} label="✕" armedLabel="Delete?" onConfirm={() => deleteLog(exId, i)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="actions"><button type="button" className="btn" onClick={closeModal}>Close</button></div>
    </Sheet>
  );
}
