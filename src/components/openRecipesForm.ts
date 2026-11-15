import { afterSheetClose } from '../lib/backNav.js';
import { requestRecipesJump, type RecipesJump } from '../lib/recipesJump.js';
import { useAppStore } from '../store/useAppStore.js';
import { navigate } from './useRoute.js';

/** Close the open sheet, then open Recipes on a form: the blank one (`new`) or one recipe's (`edit`). The page is opened after the sheet's own Back step (lib/backNav.ts), or that step would undo it. */
export function openRecipesForm(jump: RecipesJump): void {
  requestRecipesJump(jump);
  afterSheetClose(window.history, window, () => { useAppStore.getState().setTab('daily'); navigate('daily/recipes/form', 'push'); });
  useAppStore.getState().closeModal();
}
