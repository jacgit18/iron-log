import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { PHASES, PH_KEYS, slotsFor, exInfo, allExIds } from '../../lib/data.js';
import { MON, fmtShort } from '../../lib/dates.js';
import { programFor, progName } from '../../lib/logic.js';
import { backupCfg } from '../../lib/export.js';
import CommitInput from '../CommitInput.jsx';
import { BackupMessage } from '../progress/Progress.jsx';

function ModePanel() {
  const cfg = useAppStore(s => s.cfg); const st = useAppStore.getState();
  const now = new Date(); const yr = now.getFullYear();
  const a = progName(cfg, 'A'), b = progName(cfg, 'B');
  const modes = [[1, `${a} only`, `Run ${a} every week.`], [2, 'Alternate monthly', `${a} and ${b} take turns by month.`], [3, 'Swap every 6 months', 'Six months on one program, then six on the other.']];
  return (
    <section className="panel">
      <h2>Program mode</h2>
      <div className="modes">
        {modes.map(([m, t, dsc]) => (
          <label className="mode" key={m}>
            <input type="radio" name="mode" id={`mode-${m}`} value={m} checked={cfg.mode === m} onChange={() => st.setMode(m)} />
            <div><b>Mode {m} · {t}</b><span>{dsc}</span></div>
          </label>
        ))}
      </div>
      {cfg.mode === 3 && (
        <div className="inline" style={{ flexWrap: 'wrap' }}>
          <label htmlFor="m3s">First block starts in</label>
          <select id="m3s" className="btn sm" value={cfg.m3Start} onChange={e => st.setCfgField('m3Start', Number(e.target.value))}>
            {MON.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <label htmlFor="m3f">on</label>
          <select id="m3f" className="btn sm" value={cfg.m3First} onChange={e => st.setCfgField('m3First', e.target.value)}>
            {['A', 'B'].map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      )}
      {cfg.mode === 2 && (
        <div className="inline">
          <label htmlFor="m2e">Even months run</label>
          <select id="m2e" className="btn sm" value={cfg.m2Even} onChange={e => st.setCfgField('m2Even', e.target.value)}>
            {['A', 'B'].map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      )}
      <p>{yr} at a glance. Weeks run Sunday to Saturday; a week follows the month its Sunday falls in. In Mode 2 you can also switch a single week to A or B from the board.</p>
      <div className="months">
        {MON.map((m, i) => { const p = programFor(cfg, new Date(yr, i, 1)); return <div key={m} className={`${p === 'B' ? 'b' : ''}${i === now.getMonth() ? ' now' : ''}`}>{m[0]}<br />{p}</div>; })}
      </div>
    </section>
  );
}

function PhasePanel() {
  const cfg = useAppStore(s => s.cfg); const st = useAppStore.getState();
  return (
    <section className="panel">
      <h2>Phases</h2>
      <p>Target weight = your 1RM × the phase %. Rounded to 2.5 lb under 50 lb, 5 lb above.</p>
      <div className="tbl">
        <table>
          <thead><tr><th>Phase</th><th>% of 1RM</th><th>Sets × reps</th></tr></thead>
          <tbody>
            {PH_KEYS.map(k => {
              const pct = cfg.pct[k] ?? PHASES[k].pct; const rx = cfg.rxOverride[k] || PHASES[k].rx;
              return (
                <tr key={k}>
                  <td><span className="dot" data-p={k} /> {PHASES[k].label}</td>
                  <td><CommitInput key={`${k}:${pct}`} type="number" id={`pct-${k}`} aria-label={`${PHASES[k].label} % of 1RM`} min="0" max="110" step="1" value={pct} onCommit={v => st.setPct(k, v)} /> %</td>
                  <td><CommitInput key={`${k}:${rx}`} className="wide" id={`rx-${k}`} aria-label={`${PHASES[k].label} sets × reps`} value={rx} onCommit={v => st.setRxOverride(k, v)} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <label className="inline" htmlFor="rest-s">Rest between sets{' '}
        <CommitInput key={`rest:${cfg.rest ?? 90}`} type="number" id="rest-s" min="0" max="600" step="any" value={cfg.rest ?? 90} style={{ width: 80 }} onCommit={st.setRest} /> seconds
      </label>
      <p>The percentages are placeholders until you set your own. Isometric holds are usually judged by time and effort more than by % of a lifting max.</p>
    </section>
  );
}

function DataPanel() {
  const dl = useAppStore(s => s.dl); const exporting = useAppStore(s => s.exporting); const st = useAppStore.getState();
  const [paste, setPaste] = useState('');
  return (
    <section className="panel">
      <h2>Export &amp; import</h2>
      <p>One file with everything: your log, weekly check-offs, body weight, programs, saved versions and settings. Use it to keep a copy, move to another device or app, or go back to an earlier state.</p>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        {dl && <button type="button" className="btn primary" disabled={!!exporting} onClick={st.downloadData}>Export all data</button>}
        <label className="btn filebtn">Import from file
          <input type="file" id="imp-file" accept=".json,application/json" hidden onChange={e => { st.readImportFile(e.target.files && e.target.files[0]); e.target.value = ''; }} />
        </label>
      </div>
      <details className="imppaste">
        <summary>Can't pick a file? Paste its contents instead</summary>
        <textarea id="imp-text" rows={4} placeholder="Paste the contents of an iron-log-data file" value={paste} onChange={e => setPaste(e.target.value)} />
        <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="btn sm" onClick={() => st.pasteImport(paste)}>Review import</button>
        </div>
      </details>
    </section>
  );
}

function BackupPanel() {
  const cfg = useAppStore(s => s.cfg); const dl = useAppStore(s => s.dl); const mcp = useAppStore(s => s.mcp);
  const busy = useAppStore(s => s.backupBusy); const exporting = useAppStore(s => s.exporting); const st = useAppStore.getState();
  const b = backupCfg(cfg); const l = b.last;
  return (
    <section className="panel">
      <h2>Excel &amp; backups</h2>
      <p><b>iron-log.xlsx</b> has a summary per exercise, every session, weekly totals and your settings. Each week also gets its own workbook with the plan and what you logged{mcp && <>, saved in <b>weeks/</b> when you back up to GitHub</>}.</p>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        {dl && <>
          <button type="button" className="btn" disabled={!!exporting} onClick={() => st.downloadExcel('all')}>Download Excel</button>
          <button type="button" className="btn" disabled={!!exporting} onClick={() => st.downloadExcel('week')}>Download this week</button>
        </>}
      </div>
      {mcp && <>
        <label className="field">Backup repo (owner/name)
          <CommitInput key={`repo:${b.repo}`} id="bk-repo" value={b.repo} placeholder="owner/repo" onCommit={st.setBackupRepo} />
        </label>
        <div className="actions" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="btn primary" disabled={busy} onClick={st.backupToGitHub}>{busy ? 'Backing up…' : 'Back up to GitHub'}</button>
        </div>
        <p className="note">
          {l ? <>Last backup {fmtShort(new Date(l.at))} · {l.files} file{l.files > 1 ? 's' : ''} · <a href={l.url} target="_blank" rel="noopener noreferrer">view on GitHub</a></> : 'No backups yet.'}
          {' '}Uses your Composio GitHub connection. Only weeks that changed are sent again.
        </p>
      </>}
      {mcp === null && window.claude && <p className="note">GitHub backup needs the Composio connector, which isn't available in this view.</p>}
      <BackupMessage />
    </section>
  );
}

function RmPanel() {
  const cfg = useAppStore(s => s.cfg); const logs = useAppStore(s => s.logs); const programs = useAppStore(s => s.programs);
  const st = useAppStore.getState();
  const all = [...slotsFor(programs.A), ...slotsFor(programs.B)];
  const weighted = allExIds(cfg).filter(id => all.some(s => s.items.some(i => i.ex === id && i.w != null)));
  return (
    <section className="panel" style={{ gridColumn: '1/-1' }}>
      <h2>1-rep maxes</h2>
      <p>Enter a 1RM to switch that exercise's target from the program weight to a phase-based weight. Leave blank to keep the program weight.</p>
      <div className="tbl">
        <table>
          <thead><tr><th>Exercise</th><th>Program weight</th><th>1RM (lb)</th><th>Best logged</th></tr></thead>
          <tbody>
            {weighted.map(id => {
              const ws = [...new Set(all.flatMap(s => s.items.filter(i => i.ex === id && i.w != null).map(i => i.w)))];
              const best = (logs[id] || []).map(e => Number(e.w)).filter(n => n > 0);
              return (
                <tr key={id}>
                  <td>{exInfo(cfg, id).n}</td>
                  <td>{ws.join(' / ')} lb</td>
                  <td><CommitInput key={`${id}:${cfg.rm[id] ?? ''}`} type="number" id={`rm-${id}`} min="0" step="any" value={cfg.rm[id] ?? ''} placeholder="—" onCommit={v => st.setRm(id, v)} /></td>
                  <td>{best.length ? Math.max(...best) + ' lb' : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Settings() {
  const importCount = useAppStore(s => s.importCount);
  return (
    <div className="settings">
      <ModePanel />
      <PhasePanel />
      <DataPanel key={importCount} />
      <BackupPanel />
      <RmPanel />
    </div>
  );
}
