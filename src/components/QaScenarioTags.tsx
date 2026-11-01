import { useState } from 'react';
import './QaScenarioTags.css';
import { NO_SCENARIOS, scenarioTag, scenarioToggleLabel, type QaPersonaRow } from '../lib/qaPersonas.js';

// The "Used in S-04, S-11" line under a test account (brief qa-scenarios). The line is a button: it opens the scenario ids with their titles.
// The steps stay in the scenarios document, so this shows no more than the list answer carries.
export default function QaScenarioTags({ row, idPrefix }: { row: QaPersonaRow; idPrefix: string }) {
  const [open, setOpen] = useState(false);
  const tag = scenarioTag(row);
  if (!tag) return <p className="qahint">{NO_SCENARIOS}</p>;
  const listId = `${idPrefix}-scn-${row.id}`;
  return (
    <div className="qascn">
      <button type="button" className="qascnbtn" aria-expanded={open} aria-controls={listId} aria-label={scenarioToggleLabel(row, open)} onClick={() => setOpen(o => !o)}>{tag}</button>
      {open && (
        <ul className="qascnlist" id={listId}>
          {row.scenarios.map(s => <li key={s.id}><b>{s.id}</b> {s.title}</li>)}
        </ul>
      )}
    </div>
  );
}
