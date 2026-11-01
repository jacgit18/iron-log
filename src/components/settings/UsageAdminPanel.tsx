import { lazy, Suspense, useState } from 'react';
import { useFeature } from '../../features.js';
import './UsagePanel.css';

// Usage counts for the owner (brief opt-in-usage-counts). Admin-only for good (features.ts `adminUsage`; the API is behind requireAdmin and the
// database checks users.is_admin). The list is its own chunk and is asked for only when "Show usage" is pressed, so it costs nobody else
// anything and nothing arrives after load to move the page.
const UsageList = lazy(() => import('./UsageList.js'));

export default function UsageAdminPanel() {
  const allowed = useFeature('adminUsage');
  const [open, setOpen] = useState(false);
  if (!allowed) return null;
  return (
    <section className="panel usage" aria-labelledby="usage-admin-h">
      <h3 id="usage-admin-h">Usage</h3>
      <p>Anonymous counts from phones that opted in. Only you can see this.</p>
      <div className="actions">
        <button type="button" className="btn sm" aria-expanded={open} onClick={() => setOpen(o => !o)}>{open ? 'Hide usage' : 'Show usage'}</button>
      </div>
      {open && (
        <Suspense fallback={<p role="status">Loading usage…</p>}>
          <UsageList />
        </Suspense>
      )}
    </section>
  );
}
