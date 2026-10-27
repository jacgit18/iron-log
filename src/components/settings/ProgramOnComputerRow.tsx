import { isTouchScreen } from '../../lib/revealField.js';
import { ROW_TEXT, ROW_TITLE, showProgramRow } from '../../lib/programOnComputer.js';
import { SendLinkButton } from '../ProgramOnComputer.js';

// Settings, App group: the always-there copy of the Program tab tip, for anyone who dismissed the card. Touch screens only.
export default function ProgramOnComputerRow() {
  if (!showProgramRow(isTouchScreen())) return null;
  return (
    <section className="panel">
      <h3>{ROW_TITLE}</h3>
      <p>{ROW_TEXT}</p>
      <div className="actions"><SendLinkButton primary /></div>
    </section>
  );
}
