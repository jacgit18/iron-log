import { useEffect, useRef } from 'react';
import type { MuscleKey } from '../../types.ts';
import { useAppStore } from '../../store/useAppStore.js';
import { exInfo } from '../../lib/data.js';
import { progName } from '../../lib/logic.js';
import { MUSCLES, M_KEYS, SIL, FRONT, BACK, level, fmtSets, muscleVolumeAll } from '../../lib/muscles.js';
import RemovedNotice from '../RemovedNotice.jsx';
import './Muscles.css';

const MIRROR = 'matrix(-1 0 0 1 200 0)';

type Volume = ReturnType<typeof muscleVolumeAll>['vol'];
type VolRow = Volume[MuscleKey]['ex'][number];
type Grouped = VolRow & { at: Record<string, Set<number>> };

function Figure({ shapes, label, vol, sel, onPick }: { shapes: [MuscleKey, string][]; label: string; vol: Volume; sel: MuscleKey | null; onPick: (m: MuscleKey) => void }) {
  return (
    <figure className="fig">
      <svg viewBox="30 0 140 420" role="group" aria-label={`${label} view`}>
        <circle className="sil" cx="100" cy="26" r="17" />
        <path className="sil" d={SIL} />
        <path className="sil" d={SIL} transform={MIRROR} />
        {shapes.flatMap(([m, d]) => {
          const cls = `mu l${level(vol[m].sets)}${sel === m ? ' sel' : ''}`;
          const title = `${MUSCLES[m].n}: ${vol[m].sets ? fmtSets(vol[m].sets) + ' sets/week' : 'not trained'}`;
          return [false, true].map(mir => (
            <path key={`${m}-${mir}`} className={cls} d={d} transform={mir ? MIRROR : undefined} onClick={() => onPick(m)}>
              <title>{title}</title>
            </path>
          ));
        })}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

function MuscleDetail({ m, v, keys, withSec }: { m: MuscleKey; v: Volume[MuscleKey]; keys: string[]; withSec: boolean }) {
  const cfg = useAppStore(s => s.cfg);
  const { selectMuscle, openModal } = useAppStore.getState();
  const grouped: Record<string, Grouped> = {};
  v.ex.forEach(e => { const k = e.ex + '|' + e.role; const g = (grouped[k] = grouped[k] || { ...e, at: {} }); (g.at[e.prog!] = g.at[e.prog!] || new Set()).add(e.day); });
  const first = (r: Grouped) => Math.min(...Object.values(r.at).flatMap(s => [...s]));
  const rows = Object.values(grouped).sort((a, b) => (a.role === b.role ? first(a) - first(b) : a.role === 'p' ? -1 : 1));
  const where = (r: Grouped) => keys.filter(k => r.at[k]).map(k => `${keys.length > 1 ? progName(cfg, k) + ': ' : ''}${[...r.at[k]].sort().map(d => 'D' + d).join(' ')}`).join(' · ');
  const progs = keys.map(k => progName(cfg, k)).join(' and ');
  return (
    <div className="msec mdetail">
      <div className="inline between">
        <h2>{MUSCLES[m].n}</h2>
        <button type="button" className="btn sm ghost" onClick={() => selectMuscle(null)}>Close</button>
      </div>
      <p>
        {v.sets
          ? <>About <b>{fmtSets(v.sets)}</b> sets a week{keys.length > 1 ? `, averaged across ${progs}` : ''}.{withSec ? ' Secondary work counts as half a set.' : ' Primary work only.'}</>
          : `Nothing in ${progs} trains this.`}
      </p>
      {rows.length > 0 && (
        <div className="mlist">
          {rows.map(r => (
            <div className="mrow" key={`${r.ex}|${r.role}`}>
              <span className={`role ${r.role}`}>{r.role === 'p' ? 'Primary' : 'Secondary'}</span>
              <span className="mname">{exInfo(cfg, r.ex).n}{r.either && <> <small>(either/or)</small></>}</span>
              <span className="mdays">{where(r)}</span>
              <button type="button" className="btn sm ghost" onClick={() => openModal({ type: 'tags', exId: r.ex })}>Edit</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Ranking({ vol, onPick }: { vol: Volume; onPick: (m: MuscleKey) => void }) {
  const ranked = M_KEYS.map(k => ({ k, s: vol[k].sets })).sort((a, b) => b.s - a.s);
  const top = Math.max(...ranked.map(x => x.s));
  const none = ranked.filter(r => !r.s);
  return (
    <div className="msec">
      <h2>Weekly sets by muscle</h2>
      <p>Tap a muscle on the body or in this list to see the exercises that train it.</p>
      <div className="mbars">
        {ranked.filter(r => r.s).map(r => (
          <button type="button" className="mbar" key={r.k} onClick={() => onPick(r.k)}>
            <span>{MUSCLES[r.k].n}</span>
            <span className="track"><i className={`l${level(r.s)}`} style={{ width: `${Math.min(100, r.s / top * 100)}%` }} /></span>
            <b>{fmtSets(r.s)}</b>
          </button>
        ))}
      </div>
      {none.length > 0 && (
        <p className="mnone"><b>Not trained:</b>
          {none.map(r => (
            <button key={r.k} type="button" className="linkbtn" onClick={() => onPick(r.k)}>{MUSCLES[r.k].n}</button>
          ))}
        </p>
      )}
    </div>
  );
}

// One box: the legend and secondary switch on top, the body on the left and, beside it, the ranking (or the chosen muscle's exercises)
// and the exercises with no tags. A tapped muscle also filters the lists below the box on the Progress page.
export default function Muscles() {
  const cfg = useAppStore(s => s.cfg);
  const programs = useAppStore(s => s.programs);
  const sel = useAppStore(s => s.bodySel); const withSec = useAppStore(s => s.bodySec);
  const { selectMuscle, setBodySec, openModal } = useAppStore.getState();
  const { vol, untagged, keys } = muscleVolumeAll(cfg, programs, withSec);
  // On a phone the detail sits under the figures; a tap on the body brings it into view (the list is right there already).
  const side = useRef<HTMLDivElement>(null);
  const reveal = useRef(false);
  const revealDetail = () => {
    const panel = side.current?.querySelector<HTMLElement>('.mdetail');
    if (!panel || !window.matchMedia('(max-width:900px)').matches) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    panel.scrollIntoView({ block: 'nearest', behavior: smooth ? 'smooth' : 'auto' });
  };
  const pickOnBody = (m: MuscleKey) => {
    if (m === sel) { revealDetail(); return; }
    reveal.current = true;
    selectMuscle(m);
  };
  useEffect(() => {
    if (!reveal.current) return;
    reveal.current = false;
    revealDetail();
  }, [sel]);

  return (
    <section className="panel mapbox">
      <RemovedNotice scope="muscles" />
      <div className="legend">
        <span><i className="sw l0" />Not trained</span><span><i className="sw l1" />1–4 sets</span><span><i className="sw l2" />5–9</span>
        <span><i className="sw l3" />10–20</span><span><i className="sw l4" />Over 20</span><span className="note">per week</span>
      </div>
      <label className="inline"><input type="checkbox" id="body-sec" checked={withSec} onChange={e => setBodySec(e.target.checked)} /> Count secondary work (as half a set)</label>
      <div className="bodywrap">
        <div className="figs">
          <Figure shapes={FRONT} label="Front" vol={vol} sel={sel} onPick={pickOnBody} />
          <Figure shapes={BACK} label="Back" vol={vol} sel={sel} onPick={pickOnBody} />
        </div>
        <div className="bodyside" ref={side}>
          {sel ? <MuscleDetail m={sel} v={vol[sel]} keys={keys} withSec={withSec} /> : <Ranking vol={vol} onPick={selectMuscle} />}
          {untagged.length > 0 && (
            <div className="msec">
              <h2>Not mapped yet</h2>
              <p>These exercises have no muscles tagged, so they don't show on the body.</p>
              <div className="mlist">
                {untagged.map(id => (
                  <div className="mrow" key={id}>
                    <span className="mname">{exInfo(cfg, id).n}</span>
                    <button type="button" className="btn sm" onClick={() => openModal({ type: 'tags', exId: id })}>Tag muscles</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <p className="note">Every exercise in {keys.map(k => progName(cfg, k)).join(' and ')} counts, averaged across the programs. Muscle tags are a best guess; tap Edit on any exercise to correct them.</p>
        </div>
      </div>
    </section>
  );
}
