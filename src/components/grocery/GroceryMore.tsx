import type { ReactNode } from 'react';
import Icon from '../Icon.jsx';
import './GroceryMore.css';

// The "..." menu in the Shopping toolbar (brief groceries-shopping-bought-inventory): rare actions such as Skip all, one tap away but not on the page all the time.
// On a phone (`phone`, brief groceries-spending-buttons-quick-add) it is the third of three equal buttons, reads "More", and opens over the list instead of pushing it down.
// A native details element: keyboard and screen readers work without script, and a tap on the summary again closes it.
export default function GroceryMore({ children, phone }: { children: ReactNode; phone?: boolean }) {
  return (
    <details className={phone ? 'gtoolmore gphonemore' : 'gtoolmore'}>
      <summary aria-label="More actions" id="groc-toolmore">{phone ? 'More' : <Icon name="dots" />}</summary>
      <div className="gtoolmorebody">{children}</div>
    </details>
  );
}
