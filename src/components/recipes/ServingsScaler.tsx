// "Scale for tonight" (brief recipe-servings-scaling): fewer or more servings, shown on the recipe's amounts only. Nothing is saved.
export default function ServingsScaler({ base, value, onChange }: { base: number; value: number; onChange: (n: number) => void }) {
  return (
    <div className="rc-scale" role="group" aria-label="Scale for tonight">
      <span>Scale for tonight</span>
      <button type="button" className="btn sm" aria-label="Fewer servings" disabled={value <= 1} onClick={() => onChange(value - 1)}>Fewer</button>
      <output>{value} serving{value === 1 ? '' : 's'}</output>
      <button type="button" className="btn sm" aria-label="More servings" disabled={value >= 99} onClick={() => onChange(value + 1)}>More</button>
      {value !== base && <button type="button" className="btn sm ghost" onClick={() => onChange(base)}>Reset to {base}</button>}
    </div>
  );
}
