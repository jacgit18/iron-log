import { useEffect, useRef, type ReactNode } from 'react';
import { tabAfterKey, type DayTab } from '../lib/weekDayTabs.js';
import './WeekDayCard.css';

// The phone's week and day control as one card (brief week-day-joined-tabs): the week row on top (children), the day tabs under it (`afterClick` runs after a tap, not after a key, so keyboard moves do not scroll the page), the selected day underlined, the whole card pinned while the page scrolls. The Board, Stretches and Nutrition each pass their own week row and tabs; what a tab says and which keys move between them is lib/weekDayTabs.ts. Board and Stretches keep their own week bar on a wide screen; Nutrition draws this card on every screen from 700 px (brief week-day-joined-tabs): up to 1439 px with the day tabs (the days on screen come shaded, `shaded` on the tab), from 1440 px without tabs (`tabs` empty, the seven columns are the day control), and on a wide screen `footer` holds the add-food toolbar under a hairline.
export default function WeekDayCard({ children, tabs, selected, onPick, idPrefix, controls, afterClick, footer }: {
  children: ReactNode; tabs: DayTab[]; selected: string; onPick: (id: string) => void; idPrefix: string; controls?: (id: string) => string; afterClick?: () => void; footer?: ReactNode;
}) {
  const at = tabs.findIndex(t => t.id === selected);
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => { // a card with a footer publishes its height, for the scroll offset under it (NutritionBoard.css)
    const el = card.current; if (!footer || !el) return;
    const set = () => document.documentElement.style.setProperty('--wdc-h', `${Math.round(el.getBoundingClientRect().height)}px`);
    set(); const ro = new ResizeObserver(set); ro.observe(el);
    return () => { ro.disconnect(); document.documentElement.style.removeProperty('--wdc-h'); };
  }, [!footer]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="wdc" ref={card}>
      <div className="weekbar wdc-week">{children}</div>
      {tabs.length > 0 && <div className="wdc-tabs" role="tablist" aria-label="Day" onKeyDown={e => {
        const n = tabAfterKey(e.key, Math.max(at, 0), tabs.length); if (n == null) return;
        e.preventDefault(); const els = e.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'); onPick(tabs[n]!.id); els[n]?.focus({ preventScroll: true }); // by position: the tab ids can change with the week
      }}>
        {tabs.map(t => (
          <button type="button" role="tab" key={t.id} id={`${idPrefix}${t.id}`} aria-selected={t.id === selected} aria-controls={controls?.(t.id)} tabIndex={t.id === selected ? 0 : -1}
            className={`${t.done ? 'full' : ''}${t.today ? ' today' : ''}${t.swapped ? ' swapped' : ''}${t.shaded ? ' shaded' : ''}`.trim()} aria-label={t.label} onClick={() => { onPick(t.id); afterClick?.(); }}>
            <b aria-hidden="true">{t.head}</b>{' '}<span aria-hidden="true">{t.sub}</span>
          </button>
        ))}
      </div>}
      {footer && <div className="wdc-foot">{footer}</div>}
    </div>
  );
}
