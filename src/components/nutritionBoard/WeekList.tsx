import { useEffect, useRef } from 'react';
import type { WeekChoice } from '../../lib/nutritionBoard.js';
import Icon from '../Icon.js';
import './WeekPicker.css';

// The list of weeks (brief nutrition-meal-labels-year-repeat, option A): one button per week, "Earlier" above this week and "Coming up" below it, the shown week marked and scrolled into view. Drawn by the dropdown on a desktop and by the sheet on a phone; the rules (which weeks, their names) are `weekChoices` in lib/nutritionBoard.ts.
export default function WeekList({ choices, current, onPick }: { choices: WeekChoice[]; current: number; onPick: (offset: number) => void }) {
  const on = useRef<HTMLButtonElement>(null);
  useEffect(() => { on.current?.scrollIntoView({ block: 'center' }); on.current?.focus({ preventScroll: true }); }, []);
  const earlier = choices.filter(c => c.offset < 0), ahead = choices.filter(c => c.offset >= 0);
  const group = (label: string, list: WeekChoice[]) => list.length > 0 && (
    <li role="presentation" className="nb-wl-group">
      <p className="nb-wl-hd">{label}</p>
      <ul className="nb-wl-items" aria-label={label}>
        {list.map(c => (
          <li key={c.offset}>
            <button type="button" ref={c.offset === current ? on : undefined} className={`btn nb-wl-item${c.offset === current ? ' on' : ''}`} aria-current={c.offset === current ? 'true' : undefined} aria-label={c.label} onClick={() => onPick(c.offset)}>
              <span>{c.label}</span>{c.offset === current && <Icon name="check" />}
            </button>
          </li>
        ))}
      </ul>
    </li>
  );
  return <ul className="nb-wl" aria-label="Weeks">{group('Earlier', earlier)}{group('Coming up', ahead)}</ul>;
}
