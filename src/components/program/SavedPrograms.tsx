import type { LibraryItem, Program, ProgKey } from '../../types.ts';
import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore.js';
import { useToday } from '../../store/useToday.js';
import { progName } from '../../lib/logic.js';
import { archivedHeading, splitLibrary } from '../../lib/programArchive.js';
import { DEFAULT_PROGRAM_SORT, PROGRAM_SORTS } from '../../lib/programSort.js';
import { sameProg, libDate } from '../../lib/entryMerge.js';
import { filterSavedPrograms } from '../../lib/savedProgramFilter.js';
import { MON } from '../../shared/dates.js';
import { boardNote, onBoardKeys } from '../../lib/programDay.js';
import ArmedButton from '../ArmedButton.jsx';
import RemovedNotice from '../RemovedNotice.jsx';
import SortControl from '../SortControl.jsx';
import { useSortChoice } from '../useSortChoice.js';
import { navigate } from '../useRoute.js';
import type { ReactNode } from 'react';
import './SavedPrograms.css';

// Saved programs (the library of programs). On a phone this is the last card of Programs; on a desktop it is the Saved tab (brief program-tab-desktop-layout), with the Save a copy form
// on top, a search box and one row per program. Moved out of Editor.tsx as it was; `tab` is the only new behaviour.
const progStats = (p: Program) => { const n = p.days.reduce((a, d) => a + d.slots.length, 0); return `${n} exercise${n === 1 ? '' : 's'}`; };

function LibRow({ name, meta, inUse, onLoad, loadLabel, extra, removing }: { name: string; meta: string; inUse: boolean; onLoad?: () => void; loadLabel?: string; extra?: ReactNode; removing?: boolean }) {
  return (
    <div className={`edrow${inUse ? ' inuse' : ''}${removing ? ' removing' : ''}`}>
      <div className="edmain">{removing && <span className="tag rmtag">Will be deleted · tap Delete again</span>}<b>{name}</b><span className="note">{meta}</span></div>
      <div className="edbtns">
        {inUse ? <span className="pill">In use</span> : !onLoad ? null : <ArmedButton className="btn sm" aria-label={`Put ${name} on Board`} label="Put on Board" armedLabel={loadLabel ?? 'Tap to load'} onConfirm={onLoad} />}
        {extra}
      </div>
    </div>
  );
}

export default function SavedPrograms({ k, custom, tab = false }: { k: string; custom: boolean; tab?: boolean }) {
  const cfg = useAppStore(s => s.cfg); const library = useAppStore(s => s.library); const programs = useAppStore(s => s.programs);
  const st = useAppStore.getState();
  const [name, setName] = useState('');
  const [q, setQ] = useState(''); // the Saved tab's search
  const [arming, setArming] = useState<string | null>(null); // the program whose Delete was pressed once
  const today = useToday(s => s.today);
  const cur = programs[k]; const pn = progName(cfg, k);
  const [sort, setSort] = useSortChoice('programs', PROGRAM_SORTS, DEFAULT_PROGRAM_SORT);
  const { active: items, archived } = splitLibrary(library, sort);
  const metaOf = (it: LibraryItem) => `${boardNote(onBoardKeys(it.prog, programs as Record<'A' | 'B', Program>).map(b => progName(cfg, b)))} · ${libDate(it.at)} · ${progStats(it.prog)} · ${it.created ? (it.from ? `Created from ${progName(cfg, it.from)}` : 'Created new') : `From ${progName(cfg, it.from as string)}`}${it.auto ? ' · auto-saved' : ''}`;
  const deleteBtn = (it: LibraryItem) => (
    <ArmedButton className={`btn sm ${arming === it.id ? 'danger' : 'ghost'}`} aria-label={`Delete ${it.name}`} label="Delete" armedLabel="Tap again to delete" onArmedChange={a => setArming(a ? it.id : null)} onConfirm={() => { setArming(null); st.deleteLibItem(it.id); }} />
  );
  const shown = tab ? filterSavedPrograms(items, q) : items;
  const saved = !custom || library.some(it => sameProg(it.prog, cur));
  const loadLabel = `Tap to replace ${pn}`;
  const saveForm = (
    <form className="libsave" noValidate onSubmit={e => { e.preventDefault(); st.saveCurrentAs(name); setName(''); }}>
        <label className="field grow">Save {pn} as
          <input id="lib-name" maxLength={60} value={name} onChange={e => setName(e.target.value)} placeholder={`e.g. ${pn} · ${MON[today.getMonth()]} ${today.getFullYear()}`} />
        </label>
        <button type="submit" className="btn primary">Save a copy</button>
      </form>
  );
  const unsaved = !saved ? <p className="note">{pn} has changes that aren't in a saved copy yet.</p> : null;
  return (
    <section className={`panel edpanel edprog lib${tab ? ' libtab' : ' mt-16'}`}>
      <h2>Saved programs</h2>
      <p className="note">Keep a copy of {pn} so you can come back to it. Putting a saved program on your Board replaces {pn}, and what {pn} has now is saved here first if it isn't already.</p>
      <RemovedNotice scope="library" />
      {tab && saveForm}
      {tab && unsaved}
      {tab && (items.length > 0 || archived.length > 0) && (
        <div className="inline libfind">
          <label className="field grow">Search saved programs<input id="lib-search" type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name" /></label>
          {(items.length > 1 || archived.length > 1) && <SortControl options={PROGRAM_SORTS} value={sort} onChange={setSort} />}
          <span className="note">{items.length} saved</span>
        </div>
      )}
      {!tab && (items.length > 1 || archived.length > 1) && <div className="inline"><SortControl options={PROGRAM_SORTS} value={sort} onChange={setSort} /></div>}
      <div className="edlist">
        {shown.map(it => (
          <LibRow
            key={it.id} name={it.name} removing={arming === it.id} inUse={custom && sameProg(it.prog, cur)} loadLabel={loadLabel} onLoad={() => st.loadVersion(it.id, k as ProgKey)}
            meta={metaOf(it)}
            extra={<>
              <button type="button" className="btn sm" aria-label={`Edit ${it.name}`} onClick={() => { st.setEdProg('L:' + it.id); st.setEdDay(1); if (tab) navigate('program', 'replace'); window.scrollTo({ top: 0 }); }}>Edit</button>
              <button type="button" className="btn sm ghost" aria-label={`Archive ${it.name}`} onClick={() => st.archiveLibItem(it.id)}>Archive</button>
              {deleteBtn(it)}
            </>}
          />
        ))}
        {tab && q.trim() && items.length > 0 && !shown.length && <p className="note" role="status">No saved program matches “{q.trim()}”.</p>}
        {!items.length && <p className="note">{archived.length ? `No active programs. ${archived.length} archived.` : `No saved programs yet. Save a copy of a program ${tab ? 'above' : 'below'}, or use Create a program to build your own.`}</p>}
      </div>
      {archived.length > 0 && (
        <details className="libarchive">
          <summary>{archivedHeading(archived.length)}</summary>
          <div className="edlist">
            {archived.map(it => (
              <LibRow
                key={it.id} name={it.name} removing={arming === it.id} inUse={false} meta={metaOf(it)}
                extra={<>
                  <button type="button" className="btn sm" aria-label={`Restore ${it.name}`} onClick={() => st.restoreLibItem(it.id)}>Restore</button>
                  {deleteBtn(it)}
                </>}
              />
            ))}
          </div>
        </details>
      )}
      {!tab && saveForm}
      {!tab && unsaved}
    </section>
  );
}
