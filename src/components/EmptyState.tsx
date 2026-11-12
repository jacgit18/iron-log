import type { ReactNode } from 'react';
import './EmptyState.css';

// The one empty view of a whole screen or list (brief design-language-later-slices, slice 5): a dashed box, a sentence and, when there is a first move, one button passed as `action`.
// An element that opens a different surface than the page, such as a sheet or the Board, keeps its own notice.
export default function EmptyState({ id, children, action }: { id?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="emptystate" id={id}>
      <p>{children}</p>
      {action}
    </div>
  );
}
