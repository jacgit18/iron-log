// The Undo button after a status sentence (brief nutrition-log-first-portion-row): the board's status line and the Add sheet's both use it. Render it after the sentence when an undo exists.
export default function UndoButton({ onUndo }: { onUndo: () => void }) {
  return <> <button type="button" className="btn sm ghost" onClick={onUndo}>Undo</button></>;
}
