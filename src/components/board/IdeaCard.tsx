import { useState, type DragEvent } from 'react';
import ArmedButton from '../ArmedButton.jsx';
import Icon from '../Icon.jsx';
import WatchLink from '../WatchLink.jsx';
import './IdeaCard.css';

// One idea on the Workout board's Ideas to try list: its status, name, muscles, note, the video, then one Add button and a ⋯ menu (Edit, Delete).
// The name opens Edit. Stretches keeps ExperimentCard.
type Props = {
  id: string; name: string; status: string; muscles: string[]; note?: string; url?: string;
  onAdd: () => void; onEdit: () => void; onDelete: () => void;
  drag: { onStart: (e: DragEvent) => void; onEnd: () => void };
};

export default function IdeaCard({ id, name, status, muscles, note, url, onAdd, onEdit, onDelete, drag }: Props) {
  const [more, setMore] = useState(false);
  const [armed, setArmed] = useState(false); // Delete was pressed once
  return (
    <li className={`expcard ideacard${armed ? ' removing' : ''}`} draggable onDragStart={drag.onStart} onDragEnd={drag.onEnd}>
      {armed && <span className="rmtag">Will be deleted · tap Delete again</span>}
      <div className="ideastatus">{status}</div>
      <button type="button" className="ideaname rmname" aria-label={`Edit ${name}`} onClick={onEdit}>{name}</button>
      {muscles.length > 0 && <div className="ideamuscles">{muscles.map(m => <span key={m} className="ideachip">{m}</span>)}</div>}
      {note && <div className="note ideanote">{note}</div>}
      {url && <WatchLink url={url} name={name} size="large" />}
      <div className="ideafoot">
        <button type="button" className="btn sm primary ideaadd" aria-label={`Add ${name}`} onClick={onAdd}>Add</button>
        <button type="button" className="btn sm ghost ideamore" id={`idea-more-${id}`} aria-expanded={more} aria-controls={`idea-menu-${id}`} aria-label={`More actions for ${name}`} onClick={() => { setMore(m => !m); setArmed(false); }}><Icon name="dots" /></button>
      </div>
      {more && (
        <div className="ideamenu" id={`idea-menu-${id}`} role="group" aria-label={`More actions for ${name}`} onKeyDown={e => { if (e.key === 'Escape') { setMore(false); document.getElementById(`idea-more-${id}`)?.focus(); } }}>
          <button type="button" className="btn sm ghost" aria-label={`Edit ${name} details`} onClick={onEdit}>Edit</button>
          <ArmedButton className={`btn sm ${armed ? 'danger' : 'ghost'}`} label="Delete" armedLabel="Tap again to delete" aria-label={`Delete ${name}`} onArmedChange={setArmed} onConfirm={() => { setArmed(false); onDelete(); }} />
        </div>
      )}
    </li>
  );
}
