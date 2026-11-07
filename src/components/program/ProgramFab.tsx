import { useAppStore } from '../../store/useAppStore.js';
import './ProgramFab.css';

// A phone's Create a program: a floating "+ New program" pill like the Rest timer button on the Board, above the tab bar. From 700px the header card has the button instead.
// It hides while a sheet is open and while the rest or hold timer runs (body.timing, in the stylesheet), so it never sits on the timer bar.
export default function ProgramFab() {
  const sheetOpen = useAppStore(s => s.modal !== null);
  if (sheetOpen) return null;
  return <button type="button" className="fab programfab" onClick={() => { const st = useAppStore.getState(); if (!st.blocked()) st.openModal({ type: 'newprog' }); }}>+ New program</button>;
}
