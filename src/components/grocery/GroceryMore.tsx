import type { ReactNode } from 'react';
import Icon from '../Icon.jsx';
import './GroceryMore.css';

// The "..." menu in the Shopping toolbar (brief groceries-shopping-bought-inventory): rare actions such as Skip all, one tap away but not on the page all the time.
// A native details element: keyboard and screen readers work without script, and a tap on the summary again closes it.
export default function GroceryMore({ children }: { children: ReactNode }) {
  return (
    <details className="gtoolmore">
      <summary aria-label="More actions" id="groc-toolmore"><Icon name="dots" /></summary>
      <div className="gtoolmorebody">{children}</div>
    </details>
  );
}
