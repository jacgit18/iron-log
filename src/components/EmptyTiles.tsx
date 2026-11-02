import { useId } from 'react';
import './EmptyTiles.css';

export type EmptyTile = { id: string; label: string; hint: string; onClick: () => void };

// The first-action tiles an empty list shows in place of a one-line note: a heading and up to three real buttons, each starting an action that already exists.
export default function EmptyTiles({ heading, tiles }: { heading: string; tiles: EmptyTile[] }) {
  const hid = useId();
  return (
    <section className="emptytiles" aria-labelledby={hid}>
      <h3 id={hid}>{heading}</h3>
      <ul>
        {tiles.map(t => (
          <li key={t.id}>
            <button type="button" id={t.id} onClick={t.onClick}><b>{t.label}</b><span>{t.hint}</span></button>
          </li>
        ))}
      </ul>
    </section>
  );
}
