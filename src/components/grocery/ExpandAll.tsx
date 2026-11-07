/* ---------- Expand all ---------- */
// One button on a store's heading: opens every row of that store, or closes them all once they are all open. Same words on To get and At home.
export default function ExpandAll({ label, all, onToggle }: { label: string; all: boolean; onToggle: (on: boolean) => void }) {
  return <button type="button" className="btn sm ghost gall" aria-label={`${all ? 'Hide' : 'Show'} details in ${label}`} onClick={() => onToggle(!all)}>{all ? 'Hide details' : 'Show details'}</button>;
}
