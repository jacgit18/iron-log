// The Less, amount, More line of an eaten row and of a ticked planned card (brief nutrition-log-first-portion-row, option A). Styles: `.nb-step` in `nutritionBoard/EatenRows.css`. A null step disables its button.
export default function PortionStepper({ name, text, less, more, onLess, onMore }: { name: string; text: string; less: number | null; more: number | null; onLess: (to: number) => void; onMore: (to: number) => void }) {
  return (
    <div className="nb-step" role="group" aria-label={`Portion of ${name}`}>
      <button type="button" className="btn sm" aria-label={`Less ${name}`} disabled={less === null} onClick={() => less !== null && onLess(less)}>Less</button>
      <span className="nb-stepamt">{text}</span>
      <button type="button" className="btn sm" aria-label={`More ${name}`} disabled={more === null} onClick={() => more !== null && onMore(more)}>More</button>
    </div>
  );
}
