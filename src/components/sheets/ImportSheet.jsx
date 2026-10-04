import { useAppStore } from '../../store/useAppStore.js';
import { dataStats, libDate, importSel } from '../../lib/export.js';
import Sheet from '../Sheet.jsx';
import ArmedButton from '../ArmedButton.jsx';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function ExcelImport({ draft, s, busy }) {
  const st = useAppStore.getState();
  const d = draft.data; const x = d.excel.settings; const rms = Object.keys(d.config.rm).length;
  const hasSettings = x.mode || x.rest != null || x.pct;
  return (
    <Sheet aria-label={d.excel.csv ? 'Import from CSV' : 'Import from Excel'}>
      <h2 className="cond">{d.excel.csv ? 'Import from CSV' : 'Import from Excel'}</h2>
      <p><b>{draft.name}</b>{d.exportedAt ? `, exported ${libDate(d.exportedAt)}` : ''}. {d.excel.csv ? 'This CSV file brings back' : 'This workbook brings back'}:</p>
      <ul className="implist">
        <li>{plural(s.entries, 'logged session', 'logged sessions')} across {plural(s.exercises, 'exercise', 'exercises')}. Sessions you already have here are skipped.</li>
        {s.body > 0 && <li>{s.body} body weight entr{s.body === 1 ? 'y' : 'ies'}</li>}
        {rms > 0 && <li>{plural(rms, 'one-rep max', 'one-rep maxes')} (1RM) and program names, where you haven't set them here</li>}
        {d.excel.newExercises.length > 0 && <li>New exercises added to your list: {d.excel.newExercises.join(', ')}</li>}
        {s.entries > 0 && <li>Check-offs on the Board: each session checks off its exercise in the week it was logged</li>}
      </ul>
      <p className="notice"><b>Not in an Excel file:</b> cards you skipped or moved, edited programs, saved program versions and phase defaults. Those stay as they are here. If you still have the <b>iron-log-data .json</b> file, import that instead to get everything.</p>
      {hasSettings && (
        <label className="inline"><input type="checkbox" checked={!!draft.useSettings} onChange={e => st.setImportUseSettings(e.target.checked)} /> Also use the file's program mode{x.mode ? ` (Mode ${x.mode})` : ''}, rest time and phase percentages</label>
      )}
      {d.excel.skipped > 0 && <p className="note">{plural(d.excel.skipped, 'row', 'rows')} without a date or exercise couldn't be read and will be left out.</p>}
      {busy && <p className="note">Importing…</p>}
      <div className="actions impact">
        <button type="button" className="btn" onClick={st.closeModal}>Cancel</button>
        <button type="button" className="btn primary" disabled={busy || (!s.entries && !s.body && !rms)} onClick={() => st.applyImport('merge')}>Add to my data</button>
      </div>
    </Sheet>
  );
}

export default function ImportSheet() {
  const draft = useAppStore(s => s.importDraft);
  const busy = useAppStore(s => s.importBusy);
  const dl = useAppStore(s => s.dl);
  const logs = useAppStore(s => s.logs);
  const st = useAppStore.getState();
  if (!draft) return null;
  const d = draft.data; const s = dataStats(d);
  if (draft.kind === 'excel') return <ExcelImport draft={draft} s={s} busy={busy} />;
  const cur = dataStats({ logs });
  const sel = importSel(draft); const none = !Object.values(sel).some(Boolean);
  const rows = [
    ['board', 'Board', [plural(s.weeks, 'week', 'weeks') + ' of check-offs', s.body > 0 && `${s.body} body weight entr${s.body === 1 ? 'y' : 'ies'}`, s.experiments > 0 && plural(s.experiments, 'exercise to try', 'exercises to try')].filter(Boolean).join(', ')],
    ['progress', 'Progress', `${plural(s.entries, 'logged session', 'logged sessions')} across ${plural(s.exercises, 'exercise', 'exercises')}`],
    ['muscles', 'Muscles', 'muscle tags'],
    ['program', 'Program', (s.programs.length ? `edited Program ${s.programs.join(' and ')}` : 'original programs') + (s.saved ? `, ${plural(s.saved, 'saved version', 'saved versions')}` : '') + ', custom exercises'],
    ...(d.stretches ? [['stretches', 'Stretches', `${plural(s.stretches, 'stretch', 'stretches')} in the library, ${plural(s.stretchWeeks, 'week', 'weeks')} of check-offs`]] : []),
    ...(d.supplements ? [['supplements', 'Supplements', `water logged on ${plural(s.waterDays, 'day', 'days')}, supplement library and check-offs`]] : []),
    ['settings', 'Settings', 'program mode, rest time, phase percentages and 1RMs'],
  ];
  const when = d.exportedAt ? libDate(d.exportedAt) : 'an unknown date';
  return (
    <Sheet role="dialog" aria-label="Import data">
      <h2 className="cond">Import data</h2>
      <p><b>{draft.name || 'File'}</b>, exported {when}:</p>
      <p className="note">Pick what to bring in from each tab.</p>
      <ul className="implist">
        {rows.map(([k, label, text]) => (
          <li key={k}><label className="inline"><input type="checkbox" checked={sel[k]} onChange={e => st.setImportSection(k, e.target.checked)} /> <b>{label}:</b> {text}</label></li>
        ))}
      </ul>
      <p className="note"><b>Add to my data</b> keeps everything here and adds what's missing: new sessions, weeks, body weights, saved versions and Experiment entries. If both have an edited program, yours stays and the file's is added to Saved versions.</p>
      <p className="note"><b>Replace my data</b> makes the ticked tabs match the file exactly. Anything on those tabs here that isn't in the file is deleted{cur.entries ? `, including ${plural(cur.entries, 'logged session', 'logged sessions')}` : ''}. {dl ? 'Export your current data first if you might want it back.' : ''}</p>
      {busy && <p className="note">Importing…</p>}
      {dl && <div className="actions" style={{ justifyContent: 'flex-start' }}><button type="button" className="btn sm ghost" onClick={st.downloadData}>Export current data first</button></div>}
      <div className="actions impact">
        <button type="button" className="btn" onClick={st.closeModal}>Cancel</button>
        <ArmedButton className="btn" disabled={busy || none} label="Replace my data" armedLabel="Tap again to replace" onConfirm={() => st.applyImport('replace')} />
        <button type="button" className="btn primary" disabled={busy || none} onClick={() => st.applyImport('merge')}>Add to my data</button>
      </div>
    </Sheet>
  );
}
