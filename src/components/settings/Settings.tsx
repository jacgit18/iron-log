import type { Appearance } from '../../lib/appearance.ts';
import type { Cfg } from '../../types.ts';
import type { PhaseKey, ProgKey } from '../../types.ts';
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { PHASES, PH_KEYS, slotsFor, exInfo, allExIds } from '../../lib/data.js';
import { MON, fmtShort } from '../../shared/dates.js';
import { programFor, progName, programWeights, bestByPhase, round } from '../../lib/logic.js';
import { backupCfg, ghCfg } from '../../lib/export.js';
import CommitInput from '../CommitInput.jsx';
import ArmedButton from '../ArmedButton.jsx';
import { getAppearance, setAppearance } from '../../lib/appearance.js';
import { usePwa, install, keepData, isIOS } from '../../lib/pwa.js';
import { BackupMessage } from '../progress/Progress.jsx';

function ModePanel() {
  const cfg = useAppStore(s => s.cfg); const st = useAppStore.getState();
  const now = useToday(s => s.today); const yr = now.getFullYear();
  const a = progName(cfg, 'A'), b = progName(cfg, 'B');
  const modes = [[1, `${a} only`, `Run ${a} every week.`], [2, 'Alternate monthly', `${a} and ${b} take turns by month.`], [3, 'Swap every 6 months', 'Six months on one program, then six on the other.']];
  return (
    <section className="panel">
      <h2>Program mode</h2>
      <div className="modes">
        {modes.map(([m, t, dsc]) => (
          <label className="mode" key={m}>
            <input type="radio" name="mode" id={`mode-${m}`} value={m} checked={cfg.mode === m} onChange={() => st.setMode(m as 1 | 2 | 3)} />
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
          <select id="m3f" className="btn sm" value={cfg.m3First} onChange={e => st.setCfgField('m3First', e.target.value as ProgKey)}>
            {['A', 'B'].map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
      )}
      {cfg.mode === 2 && (
        <div className="inline">
          <label htmlFor="m2e">Even months run</label>
          <select id="m2e" className="btn sm" value={cfg.m2Even} onChange={e => st.setCfgField('m2Even', e.target.value as ProgKey)}>
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

function AppearancePanel() {
  const [a, setA] = useState(getAppearance);
  const upd = (patch: Partial<Appearance>) => setA(setAppearance(patch));
  return (
    <section className="panel">
      <h2>Appearance</h2>
      <fieldset className="plain">
        <legend>Colours</legend>
        <div className="modes">
          {[['system', 'Match this device', 'Light or dark, following your system setting.'], ['light', 'Light', 'Dark text on a light background.'], ['dark', 'Dark', 'Light text on a dark background.']].map(([k, t, d]) => (
            <label className="mode" key={k}>
              <input type="radio" name="theme" value={k} checked={a.theme === k} onChange={() => upd({ theme: k as Appearance['theme'] })} />
              <div><b>{t}</b><span>{d}</span></div>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="inline"><input type="checkbox" checked={a.roomy} onChange={e => upd({ roomy: e.target.checked })} /> Roomier text (more space between lines and paragraphs)</label>
      <p>Saved on this device only.</p>
    </section>
  );
}

function DevicePanel() {
  const { installEvent, installed, persisted } = usePwa();
  const storeMode = useAppStore(s => s.storeMode);
  return (
    <section className="panel">
      <h2>App on this device</h2>
      {installed ? <p>Iron Log is installed. It opens from your home screen and works without a connection.</p>
        : installEvent ? (
          <>
            <p>Install Iron Log to open it from your home screen like any other app. It works without a connection.</p>
            <div className="actions" style={{ justifyContent: 'flex-start' }}><button type="button" className="btn primary" onClick={install}>Install app</button></div>
          </>
        ) : isIOS() ? (
          <>
            <p>To install on iPhone or iPad, open this page in Safari, then:</p>
            <ol className="helpsteps"><li>Tap the Share button.</li><li>Tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>.</li></ol>
          </>
        ) : <p>This page already works offline once loaded. To install it, use your browser's “Install app” or “Add to Home screen” menu item.</p>}
      {storeMode === 'local' && (persisted
        ? <p>Your data is kept on this device and won't be cleared to free up space.</p>
        : persisted === false ? (
          <>
            <p>Your log is stored in this browser. If the device runs low on space, the browser may clear it. Keep a copy with Export all data.</p>
            <div className="actions" style={{ justifyContent: 'flex-start' }}><button type="button" className="btn" onClick={keepData}>Keep my data on this device</button></div>
          </>
        ) : null)}
    </section>
  );
}

function PhasePanel() {
  const cfg = useAppStore(s => s.cfg); const st = useAppStore.getState();
  return (
    <section className="panel">
      <h2>Phases</h2>
      <p>Each phase has default sets × reps. The target weight starts from the weight you last logged for that exercise in that phase, otherwise the program's weight. The % of 1RM is only for comparing with your 1RM below; it doesn't set targets.</p>
      <div className="tbl">
        <table>
          <thead><tr><th>Phase</th><th>% of 1RM</th><th>Sets × reps</th></tr></thead>
          <tbody>
            {PH_KEYS.map(k => {
              const pct = cfg.pct[k] ?? PHASES[k].pct; const rx = cfg.rxOverride[k] || PHASES[k].rx;
              return (
                <tr key={k}>
                  <td><span className="dot" data-p={k} /> {PHASES[k].label}</td>
                  <td>{PHASES[k].pct === 0 ? '—' : <><CommitInput key={`${k}:${pct}`} type="number" id={`pct-${k}`} aria-label={`${PHASES[k].label} % of 1RM`} min="0" max="110" step="1" value={pct} onCommit={(v) => st.setPct(k, v)} /> %</>}</td>
                  <td><CommitInput key={`${k}:${rx}`} className="wide" id={`rx-${k}`} aria-label={`${PHASES[k].label} sets × reps`} value={rx} onCommit={(v) => st.setRxOverride(k, v)} /></td>
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
  const importError = useAppStore(s => s.importError);
  const [paste, setPaste] = useState('');
  return (
    <section className="panel">
      <h2>Export &amp; import</h2>
      <p>One file with everything: your log, weekly check-offs, body weight, programs, saved versions, the Experiment list and settings. Use it to keep a copy, move to another device or app, or go back to an earlier state.</p>
      <p>To import, use the <b>iron-log.xlsx</b> workbook or the <b>iron-log-data .json</b> file. Both bring back everything. A <b>.csv</b> export only brings back logged sessions. Workbooks exported by an older version of the app only bring back logged sessions, body weight and main settings.</p>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        {dl && <button type="button" className="btn primary" disabled={!!exporting} onClick={st.downloadData}>Export all data</button>}
        <label className="btn filebtn">Import from file
          <input type="file" id="imp-file" accept=".json,application/json,.csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" hidden aria-describedby={importError ? 'imp-err' : undefined} onChange={e => { st.readImportFile(e.target.files && e.target.files[0]); e.target.value = ''; }} />
        </label>
      </div>
      {importError && <p className="bkmsg err" role="alert" id="imp-err">{importError}</p>}
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
      <p><b>iron-log.xlsx</b> has a summary per exercise, every session, weekly totals, your settings, and your programs and check-offs, so it can be imported back whole. Each week also gets its own workbook with the plan and what you logged{mcp && <>, saved in <b>weeks/</b> when you back up to GitHub</>}.</p>
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
          {l ? <>Last backup {fmtShort(new Date(l.at))} · {l.files} file{(l.files ?? 0) > 1 ? 's' : ''} · <a href={l.url} target="_blank" rel="noopener noreferrer">view on GitHub</a></> : 'No backups yet.'}
          {' '}Uses your Composio GitHub connection. Only weeks that changed are sent again.
        </p>
      </>}
      {mcp === null && window.claude && <p className="note">GitHub backup needs the Composio connector, which isn't available in this view.</p>}
      {st.ghDirect ? <GitHubBackup /> : <BackupMessage />}
    </section>
  );
}

const ERASE = [
  ['logs', 'Logged sessions', 'every weight, set and rep, including ones logged by check-offs'],
  ['weeks', 'Weekly check-offs', 'checked, skipped and moved cards, and phase changes, for every week'],
  ['body', 'Body weight', ''],
  ['programs', 'Edited programs, saved versions and the Experiment list', 'the Board goes back to the original programs'],
  ['settings', 'Settings and 1RMs', 'program mode, rest time, phase percentages, 1RMs, phase defaults, custom exercises and muscle tags'],
];
function ErasePanel() {
  const dl = useAppStore(s => s.dl); const exporting = useAppStore(s => s.exporting); const storeMode = useAppStore(s => s.storeMode);
  const st = useAppStore.getState();
  const [sel, setSel] = useState(() => Object.fromEntries(ERASE.map(([k]) => [k, true])));
  const any = Object.values(sel).some(Boolean);
  return (
    <section className="panel erase">
      <h2>Erase data</h2>
      <p>Deletes what you check below {storeMode === 'db' ? 'from your saved data' : 'from this browser'}, to start the tracker over. It can't be undone here, so export your data or back up to GitHub first.</p>
      <fieldset>
        <legend className="sr">What to erase</legend>
        {ERASE.map(([k, label, hint]) => (
          <label className="inline" key={k}>
            <input type="checkbox" checked={sel[k]} onChange={e => setSel(v => ({ ...v, [k]: e.target.checked }))} />
            <span><b>{label}</b>{hint && <span className="note">: {hint}</span>}</span>
          </label>
        ))}
      </fieldset>
      <p className="note">Kept: display options, your GitHub token and backup settings, and backups you've already made. If you back up after erasing, the backup saves the erased state, and earlier backups stay in the branch history.</p>
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        {dl && <button type="button" className="btn" disabled={!!exporting} onClick={st.downloadData}>Export all data first</button>}
        <ArmedButton className="btn danger" disabled={!any} label="Erase selected data" armedLabel="Tap again to erase" onConfirm={() => st.eraseData(sel)} />
      </div>
    </section>
  );
}

// Standalone app: back up to a GitHub repo with a token the viewer pastes in once per device.
function GitHubBackup() {
  const cfg = useAppStore(s => s.cfg); const token = useAppStore(s => s.ghToken); const busy = useAppStore(s => s.backupBusy);
  const st = useAppStore.getState(); const [draft, setDraft] = useState('');
  const g = ghCfg(cfg); const l = g.last;
  const saveToken = () => { if (st.setGhToken(draft)) setDraft(''); };
  return (
    <div className="ghbk">
      <h3>Back up to GitHub</h3>
      <p>Saves <b>iron-log.xlsx</b> and <b>iron-log-data.json</b> in one commit on the <b>{g.branch}</b> branch of <b>{g.repo}</b>, so every backup stays in that branch's history. If the repository is public, anyone can see these files. <b>Restore from GitHub</b> reads the data file back, for example on a new phone.</p>
      <label className="field">Repository (owner/name)
        <CommitInput key={`ghrepo:${g.repo}`} id="gh-repo" value={g.repo} placeholder="owner/repo" autoCapitalize="off" spellCheck={false} onCommit={st.setGhRepo} />
      </label>
      {token ? (
        <div className="actions" style={{ justifyContent: 'flex-start', alignItems: 'center' }}>
          <span className="note">A token is saved in this browser.</span>
          <button type="button" className="btn sm ghost" onClick={st.forgetGhToken}>Remove token</button>
        </div>
      ) : (
        <form className="field" onSubmit={e => { e.preventDefault(); saveToken(); }}>
          <label htmlFor="gh-token">GitHub token (stays in this browser, never in a backup)</label>
          <div className="actions" style={{ justifyContent: 'flex-start', marginTop: 4 }}>
            <input id="gh-token" type="password" autoComplete="off" autoCapitalize="off" spellCheck={false} value={draft} onChange={e => setDraft(e.target.value)} placeholder="github_pat_…" />
            <button type="submit" className="btn sm">Save token</button>
          </div>
        </form>
      )}
      <div className="actions" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="btn primary" disabled={busy || !token} onClick={st.backupDirect}>{busy ? 'Working…' : 'Back up to GitHub'}</button>
        <button type="button" className="btn" disabled={busy} onClick={st.restoreFromGitHub}>Restore from GitHub</button>
      </div>
      <BackupMessage />
      <p className="note">{l ? <>Last backup from this device {fmtShort(new Date(l.at))}, {new Date(l.at).getFullYear()} · <a href={l.url} target="_blank" rel="noopener noreferrer">view on GitHub</a></> : 'No backups from this device yet.'}</p>
      <details className="imppaste">
        <summary>How to make a token</summary>
        <ol>
          <li>Open <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener noreferrer">GitHub → Settings → Fine-grained tokens → Generate new token</a>.</li>
          <li>Give it a name, like “Iron Log on my phone”, and an expiration date.</li>
          <li>Under <b>Repository access</b>, choose <b>Only select repositories</b> and pick <b>{g.repo}</b>.</li>
          <li>Under <b>Permissions → Repository permissions</b>, set <b>Contents</b> to <b>Read and write</b>. Nothing else is needed.</li>
          <li>Generate the token, copy it, and paste it above. Do this once on each device you use.</li>
        </ol>
      </details>
    </div>
  );
}

// One line per phase, e.g. "35 lb · Strength", so a lift trained in two phases shows which weight is which.
// With a 1RM given, each phase line also shows what that phase's % of the 1RM works out to, to compare with the logged weight.
function PhaseWeights({ list, rm, cfg }: { list: { ph: PhaseKey | null; w: number }[]; rm?: number; cfg?: Cfg }) {
  return list.map(({ ph, w }) => {
    const pct = ph && cfg ? (cfg.pct[ph] ?? PHASES[ph as PhaseKey].pct) : 0;
    return (
      <div key={`${ph}:${w}`} className="phw"><span className="dot" data-p={ph || undefined} /> {w} lb · {ph ? PHASES[ph as PhaseKey].label : 'No phase'}{rm! > 0 && pct > 0 ? ` · ${pct}% of 1RM is ${round(rm! * pct / 100)} lb` : ''}</div>
    );
  });
}

function RmPanel() {
  const cfg = useAppStore(s => s.cfg); const logs = useAppStore(s => s.logs); const programs = useAppStore(s => s.programs);
  const st = useAppStore.getState();
  const all = [...slotsFor(programs.A), ...slotsFor(programs.B)];
  const weighted = allExIds(cfg).filter(id => all.some(s => s.items.some(i => i.ex === id && i.w != null)));
  return (
    <section className="panel wide">
      <h2>1-rep maxes</h2>
      <p>Keep a one-rep max (1RM, the most you can lift once) for reference. It shows next to your logged weights but doesn't set targets: those start from the weight you last logged.</p>
      <div className="tbl">
        <table>
          <thead><tr><th>Exercise</th><th>Program weight</th><th>1RM (lb)</th><th>Best logged</th></tr></thead>
          <tbody>
            {weighted.map(id => {
              const best = bestByPhase(logs[id]);
              return (
                <tr key={id}>
                  <td>{exInfo(cfg, id).n}</td>
                  <td><PhaseWeights list={programWeights(cfg, all, id)} /></td>
                  <td><CommitInput key={`${id}:${cfg.rm[id] ?? ''}`} type="number" id={`rm-${id}`} aria-label={`${exInfo(cfg, id).n} 1RM (lb)`} min="0" step="any" value={cfg.rm[id] ?? ''} placeholder="—" onCommit={(v) => st.setRm(id, v)} /></td>
                  <td>{best.length ? <PhaseWeights list={best} rm={cfg.rm[id]} cfg={cfg} /> : '—'}</td>
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
      <div className="scol">
        <ModePanel />
        <PhasePanel />
        <AppearancePanel />
        <DevicePanel />
      </div>
      <div className="scol">
        <DataPanel key={importCount} />
        <BackupPanel />
        <ErasePanel />
      </div>
      <RmPanel />
    </div>
  );
}
