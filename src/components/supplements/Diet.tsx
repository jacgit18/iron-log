import DietPanel from '../diet/DietPanel.js';

// Diet lives in src/components/diet/ (ADR 086); this is the entry Nutrition renders.
export default function Diet({ day }: { day: string }) {
  return <DietPanel day={day} />;
}
