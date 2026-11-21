import type { CardStock } from '../../lib/boardStock.js';
import './FoodAtHome.css';

// The Have / Need pill of a ready-made food that matches an At home item (brief ready-made-have-gate): text and a colour, no action. Nothing when it has no mark.
export default function StockPill({ stock }: { stock: CardStock | null | undefined }) {
  return stock ? <span className={`rc-stock ${stock.kind}`}>{stock.text}</span> : null;
}
