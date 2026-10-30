import CommitInput from '../CommitInput.jsx';
import Icon from '../Icon.js';
import { PHASES, exInfo } from '../../lib/data.js';
import { currentMax, maxLine, phaseRows, targetNote, weightedExIds } from '../../lib/oneRepMax.js';
import { useAppStore } from '../../store/useAppStore.js';
import { Tick, useSaving } from './SavedTicks.js';
import './MaxesScreen.css';

// 1-rep maxes, worked out from the logged sets (lib/oneRepMax.ts) so nobody has to guess one. A number typed here ("I tested this") wins over the
// estimate. For reference only: a 1RM never sets a target weight. The list is one row per exercise with a program weight; a row opens that
// exercise's screen: the number, where it came from, the override field, and how each phase's best lift compares with the phase's target.
export function MaxesList({ open }: { open: (id: string) => void }) {
  const cfg = useAppStore(s => s.cfg); const logs = useAppStore(s => s.logs); const programs = useAppStore(s => s.programs);
  const ids = weightedExIds(cfg, programs);
  return (
    <section className="panel sdrills" aria-labelledby="maxes-h">
      <h3 id="maxes-h">1-rep maxes</h3>
      <p className="note">Worked out from your logged sets, so you do not have to guess. Type your own number on an exercise if you have tested it. A 1RM never sets your targets.</p>
      {ids.length === 0 && <p>No weighted exercises in your programs yet.</p>}
      {ids.map(id => (
        <button key={id} type="button" className="sdrill" id={`max-${id}`} onClick={() => open(id)}>
          <span className="sdt"><b>{exInfo(cfg, id).n}</b><span>{maxLine(currentMax(cfg.rm[id], logs[id]))}</span></span>
          <Icon name="chevron-right" />
        </button>
      ))}
    </section>
  );
}

export function MaxDetail({ id }: { id: string }) {
  const cfg = useAppStore(s => s.cfg); const logs = useAppStore(s => s.logs); const st = useAppStore.getState(); const saving = useSaving();
  const max = currentMax(cfg.rm[id], logs[id]);
  const rows = phaseRows(logs[id], max?.value ?? null, cfg);
  const typed = cfg.rm[id];
  return (
    <section className="panel maxdetail" aria-labelledby="maxd-h">
      <h3 id="maxd-h">{exInfo(cfg, id).n}</h3>
      <div className="maxbig">
        <span className="maxnum">{max ? max.value : '—'}</span><span className="maxunit">lb</span>
        {max && <span className="maxsrc">{max.source === 'tested' ? 'Tested' : 'Estimated'}</span>}
      </div>
      <p className="note">
        {max?.source === 'tested' && (max.estimate ? `You entered this. Your logs suggest about ${max.estimate} lb.` : 'You entered this number.')}
        {max?.source === 'estimated' && max.from && `From your best set: ${max.from.w} lb × ${max.from.r}${max.from.ph ? ` (${PHASES[max.from.ph].label})` : ''}.`}
        {!max && 'Log a set of 10 reps or fewer to get an estimate, or type your own.'}
      </p>
      <div className="inline">
        <label htmlFor={`rm-${id}`}>I tested this</label>
        <CommitInput key={`${id}:${typed ?? ''}`} type="number" id={`rm-${id}`} min="0" step="any" value={typed ?? ''} placeholder="None" className="w-80" onCommit={saving(`rm-${id}`, v => st.setRm(id, v))} /> lb <Tick id={`rm-${id}`} />
        {typed != null && <button type="button" className="btn sm" onClick={() => st.setRm(id, '')}>Use estimate</button>}
      </div>
      <h4>Best lift by phase</h4>
      {rows.length === 0 && <p className="note">Nothing logged for this exercise yet.</p>}
      {rows.map(r => (
        <div className="maxphase" key={String(r.ph)}>
          <span className="phname"><span className="dot" data-p={r.ph || undefined} /> {r.ph ? PHASES[r.ph].label : 'No phase'}</span>
          <span>{r.w} lb × {r.r}</span>
          <b>{r.pct != null ? `${r.pct}%` : '—'}</b>
          <span className="note maxnote">{targetNote(r)}</span>
        </div>
      ))}
      <p className="note">The estimate is weight × (1 + reps ÷ 30) from your best set of 10 reps or fewer.</p>
    </section>
  );
}

export default function MaxesScreen({ sub, open }: { sub: string | null; open: (id: string) => void }) {
  return sub ? <MaxDetail id={sub} /> : <MaxesList open={open} />;
}
