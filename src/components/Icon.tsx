import './Icon.css';

// Small inline icons that draw the same on every phone (a text glyph such as ‹ or ⋯ comes from whichever font the system picks).
// They are 1em square, take the text colour and are hidden from assistive tech: the control that holds one needs its own text or
// aria-label. Stroke icons share one style; `dots` and `play` are filled. Add a path here, not an image file.
const STROKE = {
  'arrow-down': 'M12 5v14M6 13l6 6 6-6',
  'arrow-up': 'M12 19V5M6 11l6-6 6 6',
  'chevron-down': 'M5 9l7 7 7-7',
  'chevron-left': 'M15 5l-7 7 7 7',
  'chevron-right': 'M9 5l7 7-7 7',
  'chevron-up': 'M5 15l7-7 7 7',
  close: 'M6 6l12 12M18 6L6 18',
  contrast: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 3v18M12 3a9 9 0 010 18',
  info: 'M12 11v6M12 7.5v.01M12 3a9 9 0 100 18 9 9 0 000-18z',
  moon: 'M12 3a6 6 0 009 9 9 9 0 11-9-9z',
  spark: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
  sun: 'M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  swap: 'M5 8h13M14 4l4 4-4 4M19 16H6M10 12l-4 4 4 4',
  undo: 'M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3',
  warning: 'M12 4l9 16H3zM12 10v4M12 17v.01',
} as const satisfies Record<string, string>;
const FILLED = {
  dots: 'M5 10.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM12 10.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3zM19 10.5a1.5 1.5 0 100 3 1.5 1.5 0 000-3z',
  play: 'M8 5v14l11-7z',
} as const satisfies Record<string, string>;
export type IconName = keyof typeof STROKE | keyof typeof FILLED;
const isFilled = (name: IconName): name is keyof typeof FILLED => name in FILLED;

export default function Icon({ name }: { name: IconName }) {
  const filled = isFilled(name);
  return (
    <svg className="icon" viewBox="0 0 24 24" width="1em" height="1em" aria-hidden="true" focusable="false"
      fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={isFilled(name) ? FILLED[name] : STROKE[name]} />
    </svg>
  );
}
