import { useAppStore } from '../../store/useAppStore.js';
import QaPersonaList from '../QaPersonaList.js';
import Sheet from '../Sheet.jsx';
import './QaPickerSheet.css';

// The QA test account picker (brief qa-picker-access): opened from the account menu row and from the Switch button on the QA banner. The list is
// the same component as the Settings panel's. Draws only where those two entries do: on a QA service, for an admin.
export default function QaPickerSheet() {
  const closeModal = useAppStore(s => s.closeModal);
  return (
    <Sheet className="qasheet">
      <h2 className="cond">QA test accounts</h2>
      <QaPersonaList idPrefix="qa-sheet" />
      <div className="actions"><button type="button" className="btn" onClick={closeModal}>Close</button></div>
    </Sheet>
  );
}
