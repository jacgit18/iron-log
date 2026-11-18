import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { weekChoices, weekLabel, type WeekOffset, type WeekRange } from '../../lib/nutritionBoard.js';
import { useAppStore } from '../../store/useAppStore.js';
import WeekList from './WeekList.js';
import './WeekPicker.css';

// The week's name in the week row, as a button (brief nutrition-meal-labels-year-repeat, option A): it looks as it did; tapping it lists every week. A desktop (above 700 px) opens a dropdown under it, a phone opens the bottom sheet (`nbweeks`, WeekSheet.tsx). The arrows beside it still step one week. The dropdown is drawn in the page body so the pinned card's rounded edge does not clip it.
export default function WeekPicker({ today, offset, range, phone, dates, onPick }: { today: string; offset: WeekOffset; range: WeekRange; phone: boolean; dates: string; onPick: (offset: WeekOffset) => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const [at, setAt] = useState<{ top: number; left: number } | null>(null);
  const close = () => { setOpen(false); btn.current?.focus({ preventScroll: true }); };
  useEffect(() => {
    if (!open) return;
    const place = () => { const r = btn.current!.getBoundingClientRect(); setAt({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, window.innerWidth - 328)) }); }; // the dropdown follows the week name when the page scrolls or resizes; it never closes by itself
    place();
    const away = (e: MouseEvent) => { if (!(e.target as Element).closest('.nb-wp-pop, .nb-weekname')) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('mousedown', away); document.addEventListener('keydown', key); window.addEventListener('resize', place); window.addEventListener('scroll', place, true);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);
  const choices = open ? weekChoices(today, range) : [];
  const toggle = () => {
    if (phone) { useAppStore.getState().openModal({ type: 'nbweeks', onPick }); return; }
    setOpen(o => !o);
  };
  return (
    <>
      <button ref={btn} type="button" className="nb-weekname cond" data-dates={dates} aria-haspopup={phone ? 'dialog' : 'true'} aria-expanded={phone ? undefined : open} aria-label={`${weekLabel(today, offset)}. Choose a week`} onClick={toggle}>
        {weekLabel(today, offset).split(' · ')[0]}
      </button>
      {open && at && createPortal(
        <div className="nb-wp-pop" role="dialog" aria-label="Choose a week" style={{ top: at.top, left: at.left }}>
          <WeekList choices={choices} current={offset} onPick={o => { setOpen(false); btn.current?.focus({ preventScroll: true }); onPick(o); }} />
        </div>, document.body)}
    </>
  );
}
