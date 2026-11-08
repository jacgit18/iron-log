import DietPanel from '../diet/DietPanel.js';

// Diet lives in src/components/diet/ (ADR 086); this is the entry Nutrition renders (the targets, until PR 2 of the nutrition board moves them).
export default function Diet() {
  return <DietPanel />;
}
