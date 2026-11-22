import Icon from '../Icon.js';
import '../Pill.css';
import './FoodSections.css';
import { FOOD_GROUPS, FOOD_SECTIONS, groupOf, sectionCountText, sectionsInGroup, type FoodGroup, type FoodSection, type SearchCounts, type SectionCounts } from '../../lib/foodSections.js';

// The Foods group switch (Made, Store-bought) and the pills of the open group's sections (brief foods-made-and-store-bought): Recent first when the section has some, then each section with its count.
// Groups of toggle buttons with aria-pressed, not role=tab (the list below is one list). Pure drawing: the counts and the rules come from lib/foodSections.ts.
interface Props {
  section: FoodSection;
  counts: SectionCounts;
  /** Set while a search is typed: the other group's button then says how many items match. */
  search?: SearchCounts | undefined;
  onSection: (s: FoodSection) => void;
  /** Recent is offered only when the open section has something starred, logged or opened. */
  recent?: { on: boolean; onToggle: () => void } | undefined;
}

export default function FoodSections({ section, counts, search, onSection, recent }: Props) {
  const group = groupOf(section);
  const pickGroup = (g: FoodGroup) => { if (g !== group) onSection(sectionsInGroup(g)[0]); };
  return (
    <>
      <div className="fs-groups" role="group" aria-label="Food group">
        {FOOD_GROUPS.map(g => {
          const hits = search && g.key !== group ? search.groups[g.key] : null;
          const plus = hits !== null && g.key === 'made' && search?.madePlus ? '+' : '';
          return (
            <button type="button" key={g.key} id={`recipes-group-${g.key}`} className="fs-group" aria-pressed={g.key === group} onClick={() => pickGroup(g.key)}>
              {g.label}
              {hits !== null && <span className="fs-hit"><span aria-hidden="true">{hits}{plus} {hits === 1 && !plus ? 'match' : 'matches'}</span><span className="vh"> {hits}{plus} {hits === 1 && !plus ? 'match' : 'matches'} in {g.label}</span></span>}
            </button>
          );
        })}
      </div>
      <div className="rc-tabs" role="group" aria-label="Section">
        {recent && <button type="button" className="pillbtn" id="recipes-recent" aria-pressed={recent.on} onClick={recent.onToggle}><Icon name="star-fill" />Recent</button>}
        {FOOD_SECTIONS.filter(s => s.group === group).map(s => {
          const n = sectionCountText(s.key, counts);
          return <button type="button" className="pillbtn" key={s.key} id={`recipes-sec-${s.key}`} aria-pressed={!recent?.on && s.key === section} onClick={() => onSection(s.key)}>{s.label}{n && <span className="rc-count">{n}</span>}</button>;
        })}
      </div>
    </>
  );
}
