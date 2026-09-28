import { useRef } from 'react';
import { useAppStore } from '../store/useAppStore.js';

// Modal sheet over a scrim. Clicking the scrim closes it only when the press also started on the
// scrim, so a text selection dragged out of the sheet doesn't close it.
export default function Sheet({ as: Tag = 'div', className = '', children, ...rest }) {
  const closeModal = useAppStore(s => s.closeModal);
  const downOnScrim = useRef(false);
  return (
    <div
      className="scrim"
      onPointerDown={e => { downOnScrim.current = e.target === e.currentTarget; }}
      onClick={e => { if (e.target === e.currentTarget && downOnScrim.current) closeModal(); }}
    >
      <Tag className={`sheet ${className}`.trim()} {...rest}>{children}</Tag>
    </div>
  );
}
