import { useAppStore } from '../../store/useAppStore.js';
import LogSheet from './LogSheet.js';
import DetailSheet from './DetailSheet.js';
import TagSheet from './TagSheet.js';
import SlotSheet from './SlotSheet.js';
import ExerciseSheet from './ExerciseSheet.js';
import DayAddSheet from './DayAddSheet.js';
import { StretchSheet, StretchExpSheet } from './StretchSheets.js';
import SupplementSheet from './SupplementSheet.js';
import ExperimentSheet from './ExperimentSheet.js';
import MoveSheet from './MoveSheet.js';
import NewProgramSheet from './NewProgramSheet.js';
import ImportSheet from './ImportSheet.js';
import HelpSheet from './HelpSheet.js';
import RestDateSheet from './RestDateSheet.js';
import RecipeFilters from '../recipes/RecipeFilters.js';
import RowMenuSheet from '../program/RowMenuSheet.js';

// The open sheet, if any (state.modal). Its own chunk: App loads it after the first screen.
export default function Modal() {
  const modal = useAppStore(s => s.modal);
  const slotExists = useAppStore(s => (s.modal && s.modal.type === 'log' ? s.logTargetExists(s.modal.slotId, s.modal.idx) : true));
  if (!modal || !slotExists) return null;
  switch (modal.type) {
    case 'log': return <LogSheet key={`${modal.slotId}:${modal.idx}`} slotId={modal.slotId} idx={modal.idx} />;
    case 'detail': return <DetailSheet exId={modal.exId} />;
    case 'tags': return <TagSheet key={modal.exId} exId={modal.exId} />;
    case 'slot': return <SlotSheet key={`slot-${modal.idx}`} idx={modal.idx} col={modal.col} target={modal.target} fromExp={modal.fromExp} />;
    case 'experiment': return <ExperimentSheet key={modal.id || 'new'} id={modal.id} />;
    case 'stretch': return <StretchSheet key={modal.id || 'new'} id={modal.id} />;
    case 'stretchexp': return <StretchExpSheet key={modal.id || 'new'} id={modal.id} />;
    case 'supplement': return <SupplementSheet key={modal.id || 'new'} id={modal.id} />;
    case 'exercise': return <ExerciseSheet key={modal.exId} exId={modal.exId} />;
    case 'dayadd': return <DayAddSheet key={modal.col} col={modal.col} />;
    case 'moveprog': return <MoveSheet key={`move-${modal.idx}`} idx={modal.idx as number} />;
    case 'newprog': return <NewProgramSheet />;
    case 'import': return <ImportSheet />;
    case 'rowmenu': return <RowMenuSheet key={`rowmenu-${modal.idx}`} idx={modal.idx as number} />;
    case 'restdate': return <RestDateSheet key={modal.day as number} day={modal.day as number} />;
    case 'recipefilters': return <RecipeFilters />;
    case 'help': return <HelpSheet />;
    default: return null;
  }
}
