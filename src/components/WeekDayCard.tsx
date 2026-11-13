import type { ReactNode } from 'react';
import { tabAfterKey, type DayTab } from '../lib/weekDayTabs.js';
import './WeekDayCard.css';

// The phone's week and day control as one card (brief week-day-joined-tabs): the week row on top (children), the day tabs under it (`afterClick` runs after a tap, not after a key, so keyboard moves do not scroll the page), the selected day underlined, the whole card pinned while the page scrolls. The Board, Stretches and Nutrition each pass their own week row and tabs; what a tab says and which keys move between them is lib/weekDayTabs.ts. A wide screen keeps its own week bar and does not draw this.
export default function WeekDayCard({ children, tabs, selected, onPick, idPrefix, controls, afterClick }: {
  children: ReactNode; tabs: DayTab[]; selected: string; onPick: (id: string) => void; idPrefix: string; controls?: (id: string) => string; afterClick?: () => void;
}) {
  const at = tabs.findIndex(t => t.id === selected);
  return (
    <div className="wdc">
      <div className="weekbar wdc-week">{children}</div>
      <div className="wdc-tabs" role="tablist" aria-label="Day" onKeyDown={e => {
        const n = tabAfterKey(e.key, Math.max(at, 0), tabs.length); if (n == null) return;
        e.preventDefault(); const els = e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'); onPick(tabs[n]!.id); els[n]?.focus(); // by position: the tab ids can change with the week
      }}>
        {tabs.map(t => (
          <button type="button" role="tab" key={t.id} id={`${idPrefix}${t.id}`} aria-selected={t.id === selected} aria-controls={controls?.(t.id)} tabIndex={t.id === selected ? 0 : -1}
            className={`${t.done ? 'full' : ''}${t.today ? ' today' : ''}${t.swapped ? ' swapped' : ''}`.trim()} aria-label={t.label} onClick={() => { onPick(t.id); afterClick?.(); }}>
            <b aria-hidden="true">{t.head}</b>{' '}<span aria-hidden="true">{t.sub}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
