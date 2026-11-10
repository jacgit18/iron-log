import { nutrientLabel } from '../lib/nutrientInfo.js';
import { PICKER_GROUPS } from '../lib/nutrientPickerGroups.js';

// The grouped options of a nutrient picker (supplement rows, food amount rows): Vitamins, Minerals, Other. One place, so the two pickers cannot drift.
export default function NutrientOptionGroups() {
  return <>{PICKER_GROUPS.map(g => <optgroup key={g.heading} label={g.heading}>{g.keys.map(k => <option key={k} value={k}>{nutrientLabel(k)}</option>)}</optgroup>)}</>;
}
