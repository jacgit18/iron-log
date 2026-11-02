import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SECTIONS, currentSection, pathOfSection, sectionOfPage, type SectionId } from '../../lib/progressPage.js';
import { motionOK } from '../../lib/motion.js';
import { pageOf } from '../../lib/route.js';
import { navigate, useRoutePath } from '../useRoute.js';
import './OnePage.css';

// Progress on a wide screen: every section on one page with a rail down the left (the Settings pattern). The sections are the hub's and the drill-in
// pages' own components, handed in by Progress.tsx. `progress/<page>` still opens: it scrolls to that section; the rail swaps the address, never pushes one.
export default function OnePage({ sections }: { sections: Record<SectionId, ReactNode> }) {
  const path = useRoutePath();
  const want = sectionOfPage(pageOf(path, 'progress'));
  const [cur, setCur] = useState<SectionId>(want ?? SECTIONS[0].id);
  const jumped = useRef<SectionId | null>(null); // the section a rail tap just opened: its address change must not scroll a second time

  const scrollTo = (id: SectionId) => {
    const el = document.getElementById(`pg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: motionOK() ? 'smooth' : 'instant', block: 'start' });
    el.focus({ preventScroll: true }); // the section is where Tab goes next, like Settings' groups
  };
  // An address that names a section (a pasted link, a reload, an edited hash) scrolls to it once the page is drawn.
  useEffect(() => {
    if (want && jumped.current === want) { jumped.current = null; return; }
    jumped.current = null;
    if (!want) return;
    // Sections above grow as history and charts draw, so scroll again once they have, unless the reader has already moved.
    let moved = false; const stop = () => { moved = true; };
    for (const e of ['wheel', 'touchstart', 'keydown']) window.addEventListener(e, stop, { once: true, passive: true });
    const f = requestAnimationFrame(() => scrollTo(want));
    const t = window.setTimeout(() => { if (!moved) scrollTo(want); }, 700);
    return () => { cancelAnimationFrame(f); clearTimeout(t); for (const e of ['wheel', 'touchstart', 'keydown']) window.removeEventListener(e, stop); };
  }, [want]);
  useEffect(() => {
    let frame = 0;
    const look = () => {
      frame = 0;
      const tops: Record<string, number> = {};
      for (const { id } of SECTIONS) { const t = document.getElementById(`pg-${id}`)?.getBoundingClientRect().top; if (t !== undefined) tops[id] = t; }
      const atEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      setCur(currentSection(tops, 48, atEnd));
    };
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(look); };
    look();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => { window.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (frame) cancelAnimationFrame(frame); };
  }, []);
  const jump = (id: SectionId) => { jumped.current = pathOfSection(id) === path ? null : id; navigate(pathOfSection(id), 'replace'); scrollTo(id); setCur(id); };

  return (
    <div className="pone">
      <nav className="prail" aria-label="Jump to a Progress section">
        {SECTIONS.map(s => <button key={s.id} type="button" className="chip" aria-current={cur === s.id ? 'true' : undefined} onClick={() => jump(s.id)}>{s.label}</button>)}
      </nav>
      <div className="pmain">
        {SECTIONS.map(s => <div key={s.id} id={`pg-${s.id}`} className={`psec psec-${s.id}`} tabIndex={-1}>{sections[s.id]}</div>)}
      </div>
    </div>
  );
}
