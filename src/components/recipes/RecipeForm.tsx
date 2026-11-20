import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { VIDEO_ERR, isVideoUrl } from '../../lib/data.js';
import { withoutUsed } from '../../lib/grocery.js';
import { cleanGrams, cleanKcal, cleanProtein } from '../../shared/diet.js';
import { MAX_INGREDIENTS, MAX_RECIPE_NAME, MAX_SERVING_G, MAX_TAG, MAX_TAGS_PER_RECIPE, RECIPE_CATEGORIES, RECIPE_CATEGORY_LABEL } from '../../shared/recipes.js';
import { ingredientsToText, readList } from '../../lib/ingredientList.js';
import { countedNote, foodCandidates, hasParts, linkError, mealRollup } from '../../lib/mealRollup.js';
import { mealMicroBreakdown } from '../../lib/mealMicroBreakdown.js';
import { marksOf } from '../../lib/plate.js';
import { macroLine } from '../../lib/macroLine.js';
import { sameName, stepsFromText } from '../../lib/recipeList.js';
import { cleanTag, starterTags, tagCounts, tagKey, tagLimitError } from '../../lib/recipeTags.js';
import { rescale, servingsNote, typedAmount } from '../../lib/recipeScale.js';
import { enterTarget, isEdited, pickerShowing, removeRow, restoreRow, UNDO_MS, withoutPending, withPending } from '../../lib/recipeSaferEditing.js';
import type { Pending } from '../../lib/recipeSaferEditing.js';
import { LeavePrompt, useFormLeave } from './useFormLeave.js';
import { pinFor, refreshLink, sauceCandidates, sauceFor, suggestIngredients } from '../../lib/recipeSuggest.js';
import { useAppStore } from '../../store/useAppStore.js';
import { defaultUsesFor, usesOf } from '../../lib/recipeUses.js';
import { setBeverage } from '../../lib/usualMeal.js';
import type { PlanSlot, Recipe, RecipeCategory, RecipeIngredient, RecipeUse } from '../../types.ts';
import CountsAsChips from './CountsAsChips.js';
import UsedAsChips from './UsedAsChips.js';
import UsualMealPicker from './UsualMealPicker.js';
import { useCountsAs } from './useCountsAs.js';
import IngredientList from './IngredientList.js';
import { rowsFromMicro } from '../../lib/foodAmountRows.js';
import type { AmountRow } from '../../lib/foodAmountRows.js';
import { ownAmounts, recipeMicroToSave } from '../../lib/recipeOwnAmounts.js';
import { withMicro } from '../../shared/foodMicro.js';
import FoodAmountRows from '../diet/FoodAmountRows.js';
import IngredientMacros, { type PerServing } from './IngredientMacros.js';
import IngredientRows, { type Row } from './IngredientRows.js';
import MealMicroBars from './MealMicroBars.js';
import ServingSize from './ServingSize.js';
import './RecipeDesktop.css';
import './RecipeFormSections.css';
import Icon from '../Icon.js';
import { FORM_SECTIONS, fieldForSaveError, initialOpen, sectionOf, sectionSummary, toggled, unfoldFor } from '../../lib/recipeFormSections.js';
import type { FormField, FormSection, SectionFacts } from '../../lib/recipeFormSections.js';

const TOO_FEW = 'Type at least one ingredient first.';
// How Save finds the field a problem is about: the label (or aria-label) the input starts with.
const FIELD_LABEL: Partial<Record<FormField, string>> = { name: 'Name', servings: 'Servings', minutes: 'Minutes', servingG: 'Grams per serving', kcal: 'Calories per serving', protein: 'Protein per serving', carbs: 'Carbs per serving', fat: 'Fat per serving', tags: 'New tag', url: 'Video link' };
const sameKey = (n: string, sub?: string) => `${n.trim().toLowerCase()}|${(sub ?? '').trim().toLowerCase()}`;

// The recipe form (ADR 084, laid out again in brief recipe-form-mobile-desktop): a new recipe, or one of yours to change. A new recipe starts at
// 1 serving. Ingredients are compact rows with an amount picker, or typed as a list; each can have an Alternative, and names are offered from your
// Groceries items as you type (choosing one pins it to that item). Steps are typed one per line. Nutrition per serving is folded away until opened.
// `start`: a name and link to begin a new recipe with (a link shared in from another app, lib/shareTarget.ts).
// The form registers what Back and a Daily section switch should do in lib/recipeFormGuard.ts (Recipes.tsx and Daily.tsx ask it; brief recipe-safer-editing).
export default function RecipeForm({ recipe, start, onDone }: { recipe?: Recipe; start?: { title: string; url: string } | null; onDone: (savedId: string | null) => void }) {
  const recipes = useAppStore(s => s.recipes);
  const groceryAll = useAppStore(s => s.grocery);
  const groceryMonths = useAppStore(s => s.groceryMonths);
  const items = useMemo(() => withoutUsed(groceryAll, groceryMonths).items, [groceryAll, groceryMonths]); // a used one-time item is not offered
  const sauces = useMemo(() => sauceCandidates(recipes, recipe?.id), [recipes, recipe?.id]); // the sauces and seasonings a line can link to
  const { foods, meals } = useMemo(() => foodCandidates(recipes, recipe?.id), [recipes, recipe?.id]); // the foods and meals a line can link to, with an amount
  const [n, setN] = useState(recipe?.n ?? start?.title ?? '');
  const [cat, setCat] = useState<RecipeCategory>(recipe?.cat ?? 'other');
  const [uses, setUsesNow] = useState<RecipeUse[]>(() => (recipe ? usesOf(recipe) : defaultUsesFor('other'))); // brief recipes-used-as-ingredients-tab: follows the category until one is pressed
  const [usesPicked, setUsesPicked] = useState(!!recipe?.uses);
  const pickUses = (next: RecipeUse[]) => { setUsesNow(next); setUsesPicked(true); };
  const pickCat = (c: RecipeCategory) => { setCat(c); if (!usesPicked) setUsesNow(defaultUsesFor(c)); };
  const [beforeBev, setBeforeBev] = useState<RecipeUse[]>(); // the labels the food had when Beverage was turned on, put back when it is turned off
  const [meal, setMeal] = useState<PlanSlot | undefined>(recipe?.meal); // brief nutrition-meal-labels-year-repeat: the food's usual meal
  const countsAs = useCountsAs(recipe?.counts); // brief week-board: what it covers on a plate; automatic until pressed
  const [servings, setServings] = useState(recipe ? (recipe.servings ? String(recipe.servings) : '') : '1');
  const [minutes, setMinutes] = useState(recipe?.minutes ? String(recipe.minutes) : '');
  const [serving, setServing] = useState(recipe?.serving ?? '');
  const [servingG, setServingG] = useState(recipe?.servingG ? String(recipe.servingG) : '');
  const [kcal, setKcal] = useState(recipe?.kcal !== undefined ? String(recipe.kcal) : '');
  const [protein, setProtein] = useState(recipe?.p !== undefined ? String(recipe.p) : '');
  const [carbs, setCarbs] = useState(recipe?.c !== undefined ? String(recipe.c) : '');
  const [fat, setFat] = useState(recipe?.f !== undefined ? String(recipe.f) : '');
  // Vitamins and minerals per serving: a meal built from parts rolls them up at save; a recipe on its own numbers has typed rows (brief portion-scaled-micros, PR 2) that the ingredient calculator can fill; untouched filled rows go when calories change.
  const [rows, setRows] = useState<AmountRow[]>(() => rowsFromMicro(recipe?.micro, true));
  const [microKcal, setMicroKcal] = useState<number | undefined>(recipe?.kcal);
  const [tags, setTags] = useState<string[]>(recipe?.tags ?? []);
  const [tagText, setTagText] = useState('');
  const [own, setOwn] = useState(recipe?.own === true); // Use my own numbers: the typed numbers stay and the roll-up from the linked parts is only a hint
  const [ing, setIng] = useState<Row[]>(recipe?.ing.length ? recipe.ing.map(i => ({ ...refreshLink(i, recipes, recipe.id), amt: i.amt ?? '' })) : [{ n: '', amt: '' }]);
  const [lastServings, setLastServings] = useState<number | null>(recipe ? recipe.servings ?? null : 1); // the servings the amounts are for
  const [scaleNote, setScaleNote] = useState('');
  const [active, setActive] = useState<{ i: number; field: 'n' | 'sub' } | null>(null); // the ingredient or Alternative field being typed in: its suggestions are offered
  const [listMode, setListMode] = useState(false); // ingredients typed as a list; listBase is the text it opened with, so unedited text leaves the rows alone
  const [listText, setListText] = useState('');
  const [listBase, setListBase] = useState('');
  const [steps, setSteps] = useState(recipe?.steps.join('\n') ?? '');
  const [note, setNote] = useState(recipe?.note ?? '');
  const [url, setUrl] = useState(recipe?.url ?? start?.url ?? '');
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(initialOpen); // brief recipe-form-sections: Basics unfolded, the rest folded; kept while the form is open, not stored
  const [focusReq, setFocusReq] = useState<{ field: FormField; n: number } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Save found a problem in a field: its section unfolds and the field is focused (the section's header when the field is not a plain input).
  const fail = (field: FormField, msg: string) => { setErr(msg); setOpen(unfoldFor(open, field)); setFocusReq(r => ({ field, n: (r?.n ?? 0) + 1 })); };
  useEffect(() => {
    if (!focusReq || !formRef.current) return;
    const want = FIELD_LABEL[focusReq.field];
    const form = formRef.current;
    const inputs = want ? [...form.querySelectorAll<HTMLElement>('input[aria-label]')].filter(i => i.getAttribute('aria-label')?.startsWith(want)) : [];
    const labelled = want ? [...form.querySelectorAll('label')].filter(l => l.textContent?.startsWith(want)).map(l => l.querySelector<HTMLElement>('input, select, textarea')) : [];
    (inputs[0] ?? labelled.find(Boolean) ?? form.querySelector<HTMLElement>(`#rcf-btn-${sectionOf(focusReq.field)}`))?.focus();
  }, [focusReq]);
  // Safer editing (brief recipe-safer-editing): the form's edits are the fields now against a snapshot taken when it opened; Back, Cancel and reload ask before they lose them.
  const sig = JSON.stringify([n, cat, uses, meal, servings, minutes, serving, servingG, kcal, protein, carbs, fat, rows, tags, tagText, own, ing, listText !== listBase ? listText : '', steps, note, url]);
  const [baseSig] = useState(sig);
  const edited = isEdited(baseSig, sig);
  const [pickerAt, setPickerAt] = useState<number | null>(null); // the ingredient row whose amount picker is open
  const [pending, setPending] = useState<Pending<Row>[]>([]); // the rows Remove took out, each with its Undo for 5 seconds (newest last)
  const [restored, setRestored] = useState<{ at: number; seq: number } | null>(null); // a row Undo put back: IngredientRows moves its own row numbers
  const undoId = useRef(0);
  const timers = useRef<number[]>([]);
  const { asking, gone, keep, cancel, discard } = useFormLeave({ edited, pickerOpen: pickerShowing(pickerAt, listMode, ing.length), closePicker: () => setPickerAt(null), leave: () => onDone(null) });
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  // Enter in a text field never saves: a field that handles Enter itself (an ingredient name, the tag box, the amount picker's line) does so; any other moves to the next field, and the last one to Save.
  const enterForward = (e: KeyboardEvent<HTMLFormElement>) => {
    const el = e.target;
    if (e.key !== 'Enter' || !(el instanceof HTMLInputElement) || el.type === 'checkbox' || el.type === 'radio') return;
    const handled = e.defaultPrevented;
    e.preventDefault();
    if (handled) return;
    const fields = [...e.currentTarget.querySelectorAll<HTMLElement>('input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not(:disabled), select:not(:disabled), textarea:not(:disabled)')].filter(f => f.offsetParent !== null);
    const to = enterTarget(Math.max(0, fields.indexOf(el)), fields.length);
    (to === 'save' ? document.getElementById('rc-save') : fields[to])?.focus();
  };
  const removeIng = (i: number) => {
    const out = removeRow<Row>(ing, i, () => ({ n: '', amt: '' }));
    setIng(out.rows);
    if (!out.removed) return; // a blank row loses nothing, and never clears an Undo that is waiting
    const id = ++undoId.current;
    setPending(list => withPending(list, { ...out.removed!, name: out.removed!.row.n.trim() || `ingredient ${i + 1}`, id }));
    timers.current.push(window.setTimeout(() => setPending(list => withoutPending(list, id)), UNDO_MS));
  };
  const undoRemove = (p: Pending<Row>) => {
    const back = restoreRow(ing, p, MAX_INGREDIENTS);
    if (back) { setIng(back); setPending(list => withoutPending(list, p.id)); setRestored({ at: Math.min(p.at, ing.length), seq: (restored?.seq ?? 0) + 1 }); setErr(''); } else setErr(`A recipe holds at most ${MAX_INGREDIENTS} ingredients. Remove one to put ${p.name} back.`);
  };
  const [calc, setCalc] = useState(false); // the Calculate from ingredients panel is open
  const whole = (t: string) => (/^\d{1,4}$/.test(t.trim()) ? Number(t) : undefined);

  // The rows a typed list stands for. A line still exactly as an earlier row writes it keeps that row; a changed or new line is read again, and keeps
  // the pin and Skip of an earlier row with the same name and alternative. An amount typed in the list is what the servings shown are for.
  const read = listMode ? readList(listText, ing) : null;
  const listRows = (): { rows: Row[]; cut: boolean } | null => {
    if (!read || !read.lines.length) return null;
    const old = new Map(ing.map(i => [sameKey(i.n, i.sub), i]));
    return {
      cut: read.cut,
      rows: read.lines.map(l => {
        if ('old' in l) return l.old;
        const r = l.row, o = old.get(sameKey(r.n, r.sub)), home = o?.home ?? pinFor(r.n, r.sub, items), rid = o?.rid ?? sauceFor(r.n, sauces)?.id, q = o?.rid && o.q !== undefined ? o.q : undefined;
        return typedAmount<Row>({ n: r.n, amt: '', ...(r.sub ? { sub: r.sub } : {}), ...(home ? { home } : {}), ...(rid ? { rid } : {}), ...(q !== undefined ? { q } : {}), ...(o?.skip ? { skip: true as const } : {}) }, r.amt, lastServings);
      }),
    };
  };
  const listEdited = listMode && listText !== listBase;
  const shownRows = (): Row[] => (listEdited ? listRows()?.rows : null) ?? ing; // the rows as the list text now reads, for the helpers that work from the ingredients
  const showRows = (): string => {
    if (listEdited) {
      const r = listRows();
      if (!r) return TOO_FEW;
      setIng(r.rows); setScaleNote(r.cut ? `Only the first ${MAX_INGREDIENTS} ingredients were used.` : ''); setErr('');
    }
    setListMode(false);
    return '';
  };
  const showList = () => { setPickerAt(null); const t = ingredientsToText(ing); setListText(t); setListBase(t); setListMode(true); setErr(''); };

  const parts = hasParts({ ing: shownRows() }); // some line links to a food or meal with an amount
  const roll = parts ? mealRollup({ id: recipe?.id, ing: shownRows(), servings: whole(servings) }, recipes) : null;
  const rollText = roll && roll.counted > 0 ? macroLine(roll.per) : '';
  const breakdown = parts ? mealMicroBreakdown({ id: recipe?.id, ing: shownRows(), servings: whole(servings), ...(own ? { own: true as const } : {}) }, recipes) : null; // its vitamins and minerals, part by part, as the parts change
  const fromParts = parts && !own; // numbers shown and saved come from the parts
  const ownLive = ownAmounts(rows, kcal, microKcal); // the amount rows a recipe on its own numbers shows and saves

  const inUse = useMemo(() => tagCounts(recipes).filter(c => !tags.some(t => tagKey(t) === tagKey(c.tag))), [recipes, tags]); // tags other recipes have that this one does not: offered
  const starters = useMemo(() => starterTags(recipes, tags), [recipes, tags]); // Breakfast, Lunch, Dinner, Snack until a recipe uses them
  const addTag = (raw: string) => {
    const t = cleanTag(raw);
    if (!t) return;
    if (tags.some(x => tagKey(x) === tagKey(t))) { setTagText(''); return; }
    if (tags.length >= MAX_TAGS_PER_RECIPE) { setErr(`A recipe can have up to ${MAX_TAGS_PER_RECIPE} tags.`); return; }
    const full = tagLimitError(recipes.filter(x => x.id !== recipe?.id), [...tags, t]);
    if (full) { setErr(full); return; }
    const known = tagCounts(recipes).find(c => tagKey(c.tag) === tagKey(t))?.tag; // an existing tag keeps its spelling
    setTags([...tags, known ?? t]); setTagText(''); setErr('');
  };

  const autoP = fromParts && roll && roll.counted > 0 ? roll.per.p : protein.trim() && Number.isFinite(Number(protein)) ? Number(protein) : undefined; // the protein Save will write: from the parts, else typed
  const autoMarks = marksOf({ id: recipe?.id ?? '', n, cat, ing: shownRows().filter(i => i.n.trim()), steps: [], ...(autoP !== undefined ? { p: autoP } : {}) }, recipes);
  const pendingTag = () => { const t = cleanTag(tagText); return t && !tags.some(x => tagKey(x) === tagKey(t)) ? tagCounts(recipes).find(c => tagKey(c.tag) === tagKey(t))?.tag ?? t : ''; }; // a tag typed but not added yet is kept on Save
  const save = () => {
    if (servings.trim() && !(whole(servings) && whole(servings)! <= 99)) { fail('servings', 'Servings must be a whole number from 1 to 99.'); return; }
    if (minutes.trim() && !(whole(minutes) && whole(minutes)! <= 1440)) { fail('minutes', 'Minutes must be a whole number from 1 to 1440.'); return; }
    if (servingG.trim() && !(whole(servingG) && whole(servingG)! <= MAX_SERVING_G)) { fail('servingG', `Grams per serving must be a whole number from 1 to ${MAX_SERVING_G}.`); return; }
    const rolled = parts && !own && roll && roll.counted > 0 ? roll.per : null; // the meal's numbers come from its parts: they are saved into the same four fields everything else reads
    const k = rolled ? cleanKcal(rolled.kcal) : kcal.trim() ? cleanKcal(Number(kcal)) : undefined, pr = rolled ? cleanProtein(rolled.p) : protein.trim() ? cleanProtein(Number(protein)) : undefined;
    if (k === null) { fail('kcal', 'Calories per serving must be a number from 1 to 9,999.'); return; }
    if (pr === null) { fail('protein', 'Protein per serving must be a number from 0 to 999 g.'); return; }
    const cb = rolled ? (rolled.c !== undefined ? cleanGrams(rolled.c) : undefined) : carbs.trim() ? cleanGrams(Number(carbs)) : undefined, ft = rolled ? (rolled.f !== undefined ? cleanGrams(rolled.f) : undefined) : fat.trim() ? cleanGrams(Number(fat)) : undefined;
    if (cb === null || ft === null) { fail(cb === null ? 'carbs' : 'fat', 'Carbs and fat per serving must be numbers from 0 to 999 g.'); return; }
    if (!isVideoUrl(url) || /\s/.test(url.trim())) { fail('url', VIDEO_ERR); return; }
    const pending = pendingTag(), allTags = pending ? [...tags, pending] : tags;
    if (allTags.length > MAX_TAGS_PER_RECIPE) { fail('tags', `A recipe can have up to ${MAX_TAGS_PER_RECIPE} tags.`); return; }
    const fromList = listEdited ? listRows() : null;
    if (listEdited && !fromList) { fail('ingredients', TOO_FEW); return; }
    const source: RecipeIngredient[] = fromList ? fromList.rows : ing;
    const keep = source.filter(i => i.n.trim()).map(i => ({ n: i.n, ...(i.amt?.trim() ? { amt: i.amt } : {}), ...(i.home ? { home: i.home } : {}), ...(i.rid ? { rid: i.rid } : {}), ...(i.rid && i.q !== undefined ? { q: i.q } : {}), ...(i.sub?.trim() ? { sub: i.sub } : {}), ...(i.skip ? { skip: true as const } : {}) }));
    const microOut = recipeMicroToSave({ fromParts, rolled: rolled?.micro, rows, kcalText: kcal, kcalFrom: microKcal }); // from the parts, or the typed rows of a recipe on its own numbers
    const e = useAppStore.getState().saveRecipe({ ...(recipe ? { id: recipe.id } : {}), ...withMicro(microOut), n, cat, ...(meal ? { meal } : {}), ...(usesPicked && uses.join() !== defaultUsesFor(cat).join() ? { uses } : {}), ...(countsAs.toSave ? { counts: countsAs.toSave } : {}), ...(allTags.length ? { tags: allTags } : {}), ...(parts && own ? { own: true as const } : {}), ing: keep, steps: stepsFromText(steps), servings: whole(servings), ...(serving.trim() ? { serving: serving.trim() } : {}), ...(servingG.trim() ? { servingG: whole(servingG) ?? undefined } : {}), minutes: whole(minutes), ...(k !== undefined ? { kcal: k } : {}), ...(pr !== undefined ? { p: pr } : {}), ...(cb !== undefined ? { c: cb } : {}), ...(ft !== undefined ? { f: ft } : {}), note, ...(url.trim() ? { url: url.trim() } : {}), ...(recipe?.from ? { from: recipe.from } : {}), ...(recipe?.usual !== undefined ? { usual: recipe.usual } : {}) }); // a usual amount has no field here (ReadyMadeForm edits it): it passes through unchanged
    if (e) { fail(fieldForSaveError(e), e); return; }
    gone.current = true;
    const list = useAppStore.getState().recipes;
    onDone(recipe?.id ?? list[list.length - 1]?.id ?? null); // a new recipe is the last one: open it
  };
  // Changing Servings to a valid number rewrites the amounts (they are saved with the recipe); a number is taken as the amounts' own when none was set.
  const changeServings = (t: string) => {
    setServings(t);
    const v = whole(t);
    if (!v || v > 99) return;
    setErr('');
    // With no earlier number the amounts are only taken as being for it. The anchor is fixed on blur, not here: typing "12" key by key would
    // otherwise anchor on "1" and then read the "2" as a scale-up by 12.
    if (lastServings === null) { setScaleNote(servingsNote(null, v, 0, ing.some(x => x.amt.trim()))); return; }
    const r = rescale(ing, lastServings, v);
    setIng(r.rows); setLastServings(v);
    setScaleNote(servingsNote(lastServings, v, r.left, ing.some(x => x.amt.trim())));
  };
  const adoptNumbers = (per: PerServing) => {
    setKcal(String(per.kcal)); setProtein(String(per.p)); setRows(rowsFromMicro(per.micro, true)); setMicroKcal(per.kcal);
    if (per.c !== undefined) setCarbs(String(per.c));
    if (per.f !== undefined) setFat(String(per.f));
    setCalc(false); setErr('');
  };
  const anchorServings = () => { const v = whole(servings); if (lastServings === null && v && v <= 99) setLastServings(v); };
  const typeAmount = (i: number, amt: string) => { setIng(ing.map((x, j) => (j === i ? typedAmount(x, amt, lastServings) : x))); setErr(''); };
  const setRow = (i: number, patch: Partial<RecipeIngredient>) => { setIng(ing.map((x, j) => (j === i ? { ...x, ...patch } : x))); setErr(''); };
  // Renaming an ingredient drops its pin to an At home item (the pin was for the old name), unless the new name is exactly one of your
  // Groceries items. An ingredient with an Alternative is never pinned by its name, and changing the Alternative drops the pin: a pin outranks it in the match.
  // The same for the link to one of your sauces or seasonings: an exact name links it, any other name drops the link.
  const rename = (i: number, name: string) => setRow(i, { n: name, home: pinFor(name, ing[i]?.sub, items), rid: sauceFor(name, sauces)?.id, q: undefined });
  // The picker's choice: a linked row, filling the empty row the form starts with instead of leaving it above. Returns the row's index.
  const addSauce = (s: Recipe): number => {
    if (ing.length >= MAX_INGREDIENTS && ing[ing.length - 1]!.n.trim()) return -1; // full: the picker says so
    const last = ing[ing.length - 1], fill = !!last && !last.n.trim() && !last.amt.trim() && !last.sub, home = pinFor(s.n, undefined, items);
    const row: Row = { n: s.n, amt: '', rid: s.id, ...(home ? { home } : {}) };
    setIng(fill ? [...ing.slice(0, -1), row] : [...ing, row]); setErr('');
    return fill ? ing.length - 1 : ing.length;
  };
  // The Food or meal picker's choice: a linked row with an amount of 1, filling the empty row the form starts with. Returns why it was refused, or null.
  const addFood = (part: Recipe): string | null => {
    if (ing.length >= MAX_INGREDIENTS && ing[ing.length - 1]!.n.trim()) return `A recipe holds at most ${MAX_INGREDIENTS} ingredients. Remove one to add another.`;
    const bad = linkError(recipes, recipe?.id, part.id);
    if (bad) return bad;
    const last = ing[ing.length - 1], fill = !!last && !last.n.trim() && !last.amt.trim() && !last.sub, home = pinFor(part.n, undefined, items);
    const row: Row = { n: part.n, amt: '', rid: part.id, q: 1, ...(home ? { home } : {}) };
    if (!parts && recipe && (recipe.kcal !== undefined || recipe.p !== undefined)) setOwn(true); // an existing meal keeps its typed numbers until the person turns the switch off
    setIng(fill ? [...ing.slice(0, -1), row] : [...ing, row]); setErr('');
    return null;
  };
  const chooseOwn = (on: boolean) => {
    setOwn(on);
    if (on && roll && roll.counted > 0 && !kcal.trim() && !protein.trim()) adoptNumbers(roll.per); // nothing typed yet: start from the parts
  };
  const activeText = active === null ? '' : (active.field === 'sub' ? ing[active.i]?.sub : ing[active.i]?.n) ?? '';
  const options = useMemo(() => suggestIngredients(activeText, items, recipes.filter(r => r.id !== recipe?.id), sauces), [activeText, items, recipes, recipe?.id, sauces]);
  const typed = (s: string): number | undefined => { const n = Number(s.trim().replace(',', '.')); return s.trim() && Number.isFinite(n) ? n : undefined; }; // a comma decimal counts
  const typedLine = macroLine({ kcal: typed(kcal), p: typed(protein), c: typed(carbs), f: typed(fat) }) || 'Needs numbers';
  const nutLine = fromParts ? rollText || typedLine : typedLine;
  const sv = whole(servings);
  const servingsLine = sv && sv <= 99 ? `Amounts are for ${sv} serving${sv === 1 ? '' : 's'}.` : '';

  const facts: SectionFacts = { name: n, catLabel: RECIPE_CATEGORY_LABEL[cat], servings: sv && sv <= 99 ? sv : undefined, ingredients: shownRows().filter(i => i.n.trim()).length, steps: stepsFromText(steps).length, nutLine, tags: tags.length, hasNote: !!note.trim(), hasVideo: !!url.trim() };
  const section = (id: FormSection, children: ReactNode) => {
    const title = FORM_SECTIONS.find(s => s.id === id)!.title, isOpen = open.has(id);
    return (
      <section className="rcf-sec">
        <h4 className="rcf-shd">
          <button type="button" id={`rcf-btn-${id}`} className="rcf-toggle" aria-expanded={isOpen} aria-controls={`rcf-body-${id}`} onClick={() => setOpen(toggled(open, id))}>
            <span className="rcf-title">{title}</span>{' '}
            {!isOpen && <span className="rcf-sum">· {sectionSummary(id, facts)}</span>}
            <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} />
          </button>
        </h4>
        <div id={`rcf-body-${id}`} className="rcf-body" hidden={!isOpen}>{children}</div>
      </section>
    );
  };

  return (
    <form ref={formRef} className="rc-form rcf" onSubmit={e => { e.preventDefault(); save(); }} onKeyDown={enterForward} aria-label={recipe ? `Edit ${recipe.n}` : 'New recipe'}>
      <h3 tabIndex={-1}>{recipe ? 'Edit recipe' : 'New recipe'}</h3>
      <div className="rcf-cols">{/* from 1024 px two columns: basics, ingredients and steps beside nutrition and more (RecipeDesktop.css) */}
      <div className="rcf-col">
      {section('basics', <>
        <label>Name
          <input value={n} maxLength={MAX_RECIPE_NAME} onChange={e => { setN(e.target.value); setErr(''); }} autoComplete="off" />
        </label>
        {n.trim() && sameName(recipes, n, recipe?.id) && <p className="note">You already have a recipe with this name. You can still save it.</p>}
        <UsedAsChips value={uses} options={['meal', 'ingredient', 'drink']} onChange={pickUses} />
        <UsualMealPicker meal={meal} beverage={uses.includes('drink')} onMeal={setMeal} onBeverage={on => { if (on) setBeforeBev(uses); pickUses(setBeverage(uses, cat, on, beforeBev)); }} />
        <div className="rc-meta">
          <label>Category
            <select value={cat} onChange={e => pickCat(e.target.value as RecipeCategory)}>
              {RECIPE_CATEGORIES.filter(c => c !== 'ready').map(c => <option key={c} value={c}>{RECIPE_CATEGORY_LABEL[c]}</option>)}
            </select>
          </label>
          <label>Servings<input inputMode="numeric" value={servings} onChange={e => changeServings(e.target.value)} onBlur={anchorServings} /></label>
          <label>Minutes<input inputMode="numeric" value={minutes} onChange={e => setMinutes(e.target.value)} /></label>
        </div>
        <CountsAsChips value={countsAs.shown(autoMarks)} picked={countsAs.picked} onChange={countsAs.pick} onAuto={countsAs.reset} />
      </>)}
      {section('ing', (
        <div className="rc-form rc-ings" role="group" aria-label="Ingredients">
          <div className="seg" role="group" aria-label="How to enter ingredients">
            <button type="button" className={listMode ? '' : 'on'} aria-pressed={!listMode} onClick={() => { const m = listMode ? showRows() : ''; if (m) setErr(m); }}>Rows</button>
            <button type="button" className={listMode ? 'on' : ''} aria-pressed={listMode} onClick={() => { if (!listMode) showList(); }}>Type a list</button>
          </div>
          <p className="note" role="status">{scaleNote || servingsLine}</p>
          {listMode
            ? <IngredientList text={listText} onText={setListText} onUse={showRows} read={read!.lines.map(l => ('old' in l ? { n: l.old.n, amt: l.old.amt ?? '', ...(l.old.sub ? { sub: l.old.sub } : {}) } : l.row))} cut={read!.cut} />
            : <IngredientRows rows={ing} open={pickerAt} onOpen={setPickerAt} restored={restored} options={options} sauces={sauces} foods={foods} meals={meals} partOf={rid => recipes.find(r => r.id === rid)} onAddFood={addFood} onActive={(i, field) => setActive({ i, field })} onRename={rename} onType={typeAmount} onSet={setRow}
                onRemove={removeIng} onAdd={() => setIng([...ing, { n: '', amt: '' }])} onAddSauce={addSauce} />}
          <div role="status">{pending.map(p => <p key={p.id} className="note rc-undo">Removed {p.name}. <button type="button" className="btn sm" aria-label={`Undo remove ${p.name}`} onClick={() => undoRemove(p)}>Undo</button></p>)}</div>
        </div>
      ))}
      {section('steps', (
        <label>Steps, one per line
          <textarea rows={5} value={steps} onChange={e => setSteps(e.target.value)} />
        </label>
      ))}
      </div>
      <div className="rcf-col">
      {section('nut', <>
        <ServingSize serving={serving} grams={servingG} ingredients={shownRows()} servings={whole(servings) ?? 1} onServing={v => { setServing(v); setErr(''); }} onGrams={v => { setServingG(v); setErr(''); }} />
        <div className="rc-nut">
          <div className="rc-nuthead">
            <strong>Nutrition per serving</strong>
          </div>
          <p className="note">{nutLine}</p>
          {parts && roll && (
            <div className="rc-roll">
              <p role="status">{own ? `From the parts: ${rollText || 'Needs numbers'}` : `Per serving, from the parts: ${rollText || 'Needs numbers'}`}</p>
              <p className="note">{countedNote(roll)}</p>
              {breakdown && <MealMicroBars breakdown={breakdown} />}
              <label className="rc-own"><input type="checkbox" checked={own} onChange={e => chooseOwn(e.target.checked)} /> Use my own numbers</label>
            </div>
          )}
          <div className="rc-calcbar">
            <button type="button" className="btn sm" disabled={!ing.some(i => i.n.trim() && !i.skip)} aria-expanded={calc} onClick={() => setCalc(!calc)}>Calculate from ingredients</button>
            {!ing.some(i => i.n.trim() && !i.skip) && <span className="note"> Add ingredients first.</span>}
          </div>
          {calc && <IngredientMacros ingredients={shownRows()} servings={servings} onClose={() => setCalc(false)} onUse={adoptNumbers} />}
          {!fromParts && (
            <div className="rc-nutfields">
              <label>Calories per serving<input inputMode="numeric" value={kcal} onChange={e => setKcal(e.target.value)} /></label>
              <label>Protein per serving (g)<input inputMode="decimal" value={protein} onChange={e => setProtein(e.target.value)} /></label>
              <label>Carbs per serving (g), optional<input inputMode="decimal" value={carbs} onChange={e => setCarbs(e.target.value)} /></label>
              <label>Fat per serving (g), optional<input inputMode="decimal" value={fat} onChange={e => setFat(e.target.value)} /></label>
            </div>
          )}
          {!fromParts && <FoodAmountRows idp="rc" perServing rows={ownLive.rows} onChange={r => { setRows(r); setErr(''); }} cleared={ownLive.cleared} />}
        </div>
      </>)}
      {section('more', <>
        <fieldset className="rc-tags">
          <legend>Tags</legend>
          {tags.length > 0 && (
            <div className="rc-chips2">
              {tags.map(t => <button type="button" key={t} className="btn sm" onClick={() => setTags(tags.filter(x => x !== t))}>Remove {t}</button>)}
            </div>
          )}
          <div className="rc-tagadd">
            <input aria-label="New tag" placeholder="weeknight, meal prep…" value={tagText} maxLength={MAX_TAG} autoComplete="off"
              onChange={e => setTagText(e.target.value.replace(/,/g, ''))}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagText); } }} />
            <button type="button" className="btn sm" disabled={!tagText.trim()} onClick={() => addTag(tagText)}>Add tag</button>
          </div>
          {inUse.length > 0 && (
            <div className="rc-chips2" role="group" aria-label="Tags you use">
              {inUse.map(c => <button type="button" key={c.tag} className="btn sm ghost" onClick={() => addTag(c.tag)}>Use {c.tag}</button>)}
            </div>
          )}
          {starters.length > 0 && (
            <div className="rc-chips2" role="group" aria-label="Suggested tags">
              {starters.map(t => <button type="button" key={t} className="btn sm ghost" onClick={() => addTag(t)}>Use {t}</button>)}
            </div>
          )}
        </fieldset>
        <label>Note
          <input value={note} maxLength={300} onChange={e => setNote(e.target.value)} />
        </label>
        <label>Video link (optional)
          <input type="url" value={url} maxLength={500} placeholder="https://" onChange={e => setUrl(e.target.value)} />
          <span className="note">Opens from the recipe. YouTube or any video site.</span>
        </label>
      </>)}
      </div>
      </div>
      <div className="rcf-foot">
        {err && <p className="note gerr" role="alert">{err}</p>}
        {asking && <LeavePrompt onKeep={keep} onDiscard={discard} />}
        <div className="rc-actions rc-bar">
          <button type="button" className="btn ghost" onClick={cancel}>Cancel</button>
          <button type="submit" id="rc-save" className="btn primary">Save recipe</button>
        </div>
      </div>
    </form>
  );
}
