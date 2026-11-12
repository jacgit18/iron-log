import { test, expect } from './fixtures.js';
import { closeSheet, openAdd, openDrink, openNutrition, todayCol } from './nutritionBoardHelpers.js';

// Nutrition as one week board (brief nutrition-board). The rules (which days a week holds, the four meters eaten or planned, the meal pick by time, the hydration lines) are node tests (src/lib/nutritionBoard.test.ts);
// this covers the wiring and layout: the board and its week switcher, the toolbar's target day, the add sheet, the drink sheet, supplements on any day, the phone stepper, Back. The fixed clock is Thursday 2026-09-24, 18:30.
const TODAY = '2026-09-24';
const col = (page, day) => page.locator(`.nb-col[data-day="${day}"]`);
const meter = (c, name) => c.getByRole('img', { name: new RegExp(`^${name} `) });
const mk = (id, n, cat, kcal, p) => ({ id, n, cat, ing: [{ n: 'x' }], steps: ['Cook.'], kcal, p });
// Seeds are written after the first load, then the page reloads (fixtures.js has already opened the app).
const seedRecipes = async page => { await page.evaluate(l => localStorage.setItem('ironlog:recipes/main', JSON.stringify({ schema: 1, items: l })), [mk('chili', 'Chili', 'protein', 400, 30)]); await page.reload(); };
const seedSupps = async page => {
  await page.evaluate(() => localStorage.setItem('ironlog:supplements/main', JSON.stringify({ waterGoal: 64, waterMode: 'weight', water: {}, boost: {}, taken: {}, items: [
    { id: 'creatine', n: 'Creatine', slot: 'morning', dose: '5 g' }, { id: 'magnesium', n: 'Magnesium', slot: 'night', dose: '400 mg' },
  ] })));
  await page.reload();
};
const hash = page => page.evaluate(() => location.hash);

test('Nutrition is one board with a week switcher; the old Water, Last 7 days and Food eaten panels are gone', async ({ page }) => {
  await openNutrition(page);
  await expect(page.locator('.nb-col')).toHaveCount(7);
  await expect(page.getByRole('group', { name: 'Week' }).getByRole('button')).toHaveCount(2); // previous and next arrows, like the Board
  await expect(page.locator('.nb-weekname')).toHaveText('This week');
  await expect(page.locator('#water-h, #water7-h, #sched-h')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Food eaten' })).toHaveCount(0);
  await expect(page.locator('#diet-h')).toHaveCount(0); // the Targets block moved into the Targets and goal sheet
  await expect(page.getByRole('status').filter({ hasText: 'This week · Sep 20 to 26' })).toBeVisible();
  const h = await page.locator('#nb-h').boundingBox(); // the heading stays for screen readers but is visually hidden: nothing is drawn above the switcher (the Daily tab already says it)
  expect(h.width).toBeLessThanOrEqual(1); expect(h.height).toBeLessThanOrEqual(1);
});

test('Weeks run Sunday to Saturday: This week holds today and the days before it; Last week and Next week show other seven days, so no day appears twice', async ({ page }) => {
  await openNutrition(page);
  const days = () => page.locator('.nb-col').evaluateAll(els => els.map(e => e.dataset.day));
  const mine = await days();
  expect(mine[0]).toBe('2026-09-20'); // Sunday
  expect(mine[6]).toBe('2026-09-26'); // Saturday
  expect(mine).toContain(TODAY);
  await page.getByRole('button', { name: 'Previous week', exact: true }).click();
  const last = await days();
  expect(last[0]).toBe('2026-09-13');
  expect(last[6]).toBe('2026-09-19');
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  await page.getByRole('button', { name: 'Next week', exact: true }).click();
  const next = await days();
  expect(next[0]).toBe('2026-09-27');
  expect(new Set([...last, ...next]).size).toBe(14);
  await page.getByRole('button', { name: 'This week', exact: true }).click(); // from another week, This week returns to the current one
  expect(await days()).toEqual(mine);
  await expect(page.locator('.nb-weekname')).toHaveText('This week');
});

test('the toolbar names its day, starts on today and follows the day you tap; last week is read-only for food', async ({ page }) => {
  await openNutrition(page);
  await expect(page.locator('.nb-target')).toHaveText('Adding to Thu 24 · today');
  for (const f of ['Scan barcode', 'Quick add', 'One-off food']) await expect(page.locator('.nb-toolbar').getByRole('button', { name: f, exact: true })).toBeVisible(); // today logs eaten food
  await expect(page.locator('.nb-toolbar').getByRole('button', { name: 'Recipes', exact: true })).toHaveCount(0);
  await col(page, '2026-09-26').getByRole('button', { name: /^Sat 26/ }).click();
  await expect(page.locator('.nb-target')).toHaveText('Adding to Sat 26');
  const bar = page.locator('.nb-toolbar');
  await expect(bar.getByRole('button', { name: 'Recipes', exact: true })).toBeVisible(); // a day ahead plans: its own shortcuts, so the toolbar keeps its shape
  await expect(bar.getByRole('button', { name: 'Saved meals', exact: true })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Quick add' })).toHaveCount(0);
  await expect(bar.getByRole('button', { name: 'Scan barcode', exact: true })).toHaveCount(0);
  const edge = sel => page.locator(sel).evaluate(e => { const c = getComputedStyle(e); return { border: c.borderColor, ring: c.boxShadow }; });
  const picked = await edge('.nb-col[data-day="2026-09-26"]'), todayEdge = await edge('.nb-col.today');
  expect(picked.ring).not.toBe('none'); expect(todayEdge.ring).toBe('none'); // the accent ring marks only the picked day
  await bar.getByRole('button', { name: 'Recipes', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'Recipes' })).toBeVisible();
  await closeSheet(page);
  await col(page, '2026-09-24').getByRole('button', { name: /^Thu 24/ }).click();
  await expect(bar.getByRole('button', { name: 'Quick add' })).toBeVisible(); // back on today: log shortcuts
  await page.getByRole('button', { name: 'Previous week', exact: true }).click();
  await expect(page.locator('#nb-add')).toHaveCount(0);
  await expect(page.locator('.nb-toolbar')).toContainText('read-only');
});

test('the add sheet pre-picks the meal from the time (Dinner at 18:30) on a day ahead and remembers the last pick; today asks no meal, and a logged food moves the meters', async ({ page }) => {
  await openNutrition(page);
  let sheet = await openAdd(page);
  await expect(sheet.getByRole('group', { name: 'Which meal' })).toHaveCount(0); // eaten food has no meal
  await closeSheet(page);
  await col(page, '2026-09-25').getByRole('button', { name: /^Fri 25/ }).click();
  sheet = await openAdd(page);
  await expect(sheet.getByRole('button', { name: 'Dinner' })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'Lunch' }).click();
  await closeSheet(page);
  await col(page, '2026-09-25').getByRole('button', { name: /^Fri 25/ }).click();
  sheet = await openAdd(page);
  await expect(sheet.getByRole('button', { name: 'Lunch' })).toHaveAttribute('aria-pressed', 'true');
  await closeSheet(page);
  await todayCol(page).getByRole('button', { name: /^Thu 24/ }).click();
  const again = await openAdd(page, 'One-off food');
  await again.locator('#dt-add-n').fill('Rice');
  await again.locator('#dt-add-k').fill('300');
  await again.locator('#dt-add-p').fill('20');
  await again.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(again.getByRole('status').last()).toContainText('Added Rice');
  await closeSheet(page);
  await expect(todayCol(page).locator('.nb-eat')).toContainText('Rice');
  await expect(meter(todayCol(page), 'Calories')).toHaveAttribute('aria-label', /300/);
  await expect(meter(todayCol(page), 'Protein')).toHaveAttribute('aria-label', /20/);
});

test('editing an eaten food keeps its carbs and fat', async ({ page }) => {
  // A node test cannot catch it: the edit form is opened with the entry's numbers by the component.
  await openNutrition(page);
  const sheet = await openAdd(page, 'One-off food');
  await sheet.locator('#dt-add-n').fill('Rice');
  await sheet.locator('#dt-add-k').fill('300');
  await sheet.locator('#dt-add-p').fill('20');
  await sheet.locator('#dt-add-c').fill('40');
  await sheet.locator('#dt-add-f').fill('5');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await closeSheet(page);
  await expect(meter(todayCol(page), 'Fat')).toHaveAttribute('aria-label', /: 5 /);
  await todayCol(page).locator('.nb-eat', { hasText: 'Rice' }).getByRole('button').click(); // the row opens its sheet (brief nutrition-items-row-sheet-and-more)
  await page.getByRole('dialog').getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('dialog').locator('input[id$="-n"]').fill('Brown rice');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Done', exact: true }).click();
  await expect(todayCol(page).locator('.nb-eat')).toContainText('Brown rice');
  await expect(meter(todayCol(page), 'Fat')).toHaveAttribute('aria-label', /: 5 /);
});

test('empty meals say Nothing planned and have no button; an empty Snack is hidden', async ({ page }) => {
  await openNutrition(page);
  const c = todayCol(page);
  for (const m of ['Breakfast', 'Lunch', 'Dinner']) await expect(c.locator('.wb-slot', { hasText: m }).first()).toContainText('Nothing planned');
  await expect(c.locator('.wb-slot', { hasText: 'Snack' })).toHaveCount(0);
  await expect(c.getByRole('button', { name: /^\+ Add/ })).toHaveCount(0);
});

test('a day ahead plans recipes into the picked meal, and its meters count the plan', async ({ page }) => {
  await seedRecipes(page);
  await openNutrition(page);
  await col(page, '2026-09-25').getByRole('button', { name: /^Fri 25/ }).click();
  const sheet = await openAdd(page);
  await expect(sheet.getByRole('button', { name: /^(Quick add|One-off food|Scan barcode)/ })).toHaveCount(0); // food is eaten on the day; ahead only plans
  await sheet.getByRole('button', { name: 'Lunch' }).click();
  await sheet.getByRole('button', { name: /^Recipes/ }).click();
  await sheet.getByRole('button', { name: 'Plan Chili for Lunch' }).click();
  await expect(sheet.getByRole('status').last()).toContainText('Planned Chili for Lunch');
  await closeSheet(page);
  const fri = col(page, '2026-09-25');
  await expect(fri.locator('.wb-slot', { hasText: 'Lunch' }).locator('.wb-card')).toContainText('Chili');
  await expect(meter(fri, 'Calories')).toHaveAttribute('aria-label', /planned: 400/);
  await expect(meter(todayCol(page), 'Calories')).toHaveAttribute('aria-label', /: 0/); // today counts only what was eaten
});

test('the drink sheet adds every size, removes the last drink with Undo, and hot day changes the goal line by line', async ({ page }) => {
  await openNutrition(page);
  await expect(todayCol(page).locator('.nb-hstatus')).toHaveText('64 oz to go');
  const sheet = await openDrink(page, TODAY);
  await expect(sheet.locator('[id^="water-"]').filter({ hasText: /^\+/ })).toHaveCount(9);
  await sheet.locator('[id="water-16.9"]').click();
  await sheet.locator('#water-custom').fill('12');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet.getByRole('status').first()).toContainText('28.9');
  await sheet.locator('#water-hot').check();
  const lines = sheet.getByRole('group', { name: 'Goal breakdown' });
  await expect(lines).toContainText('Hot day');
  await expect(lines).toContainText('80 oz');
  await sheet.getByRole('button', { name: 'Remove 12 ounces, drink 2' }).click();
  await sheet.getByRole('button', { name: 'Tap again to remove' }).click();
  await expect(sheet.getByRole('button', { name: 'Undo' })).toBeVisible();
  await sheet.getByRole('button', { name: 'Undo' }).click();
  await expect(sheet.getByRole('button', { name: 'Remove 12 ounces, drink 2' })).toBeVisible();
  await closeSheet(page);
  await expect(todayCol(page).locator('.nb-hstatus')).toHaveText('51.1 oz to go');
  await expect(todayCol(page).locator('.nb-tag')).toHaveText('Hot day +16');
});

test('a day ahead sets its goal and logs no drinks; reload keeps it', async ({ page }) => {
  await openNutrition(page);
  const sheet = await openDrink(page, '2026-09-26');
  await expect(sheet.locator('#water-custom')).toHaveCount(0);
  await expect(sheet).toContainText('has not happened yet');
  await sheet.locator('#water-hot').check();
  await closeSheet(page);
  await expect(col(page, '2026-09-26').locator('.nb-hstatus')).toHaveText('Goal 80 oz');
  await page.reload();
  await expect(col(page, '2026-09-26').locator('.nb-hstatus')).toHaveText('Goal 80 oz');
});

test('supplements tick on today, last week and a day ahead, each with its own count', async ({ page }) => {
  await seedSupps(page);
  await openNutrition(page);
  const tick = (day, id) => page.locator(`[id="nb-supp-${day}-${id}"]`);
  await expect(col(page, TODAY)).toContainText('0 of 2 taken');
  await tick(TODAY, 'creatine').check();
  await expect(col(page, TODAY)).toContainText('1 of 2 taken');
  await col(page, '2026-09-26').getByRole('group', { name: 'Supplements' }).getByLabel(/Magnesium/).check();
  await expect(col(page, '2026-09-26')).toContainText('1 of 2 taken');
  await page.getByRole('button', { name: 'Previous week', exact: true }).click();
  const fold = col(page, '2026-09-19').getByRole('button', { name: /Supplements/ });
  await expect(fold).toHaveAttribute('aria-expanded', 'false'); // a past day shows one summary line
  await expect(col(page, '2026-09-19')).toContainText('0 of 2 taken');
  await fold.click();
  await tick('2026-09-19', 'creatine').check();
  await tick('2026-09-19', 'magnesium').check();
  await expect(col(page, '2026-09-19')).toContainText('2 of 2 taken');
  await page.getByRole('button', { name: 'This week', exact: true }).click();
  await expect(col(page, TODAY)).toContainText('1 of 2 taken');
});

test('an empty meal on a day ahead (not today) has an Add control that opens the add sheet on that day with that meal picked; last week has none', async ({ page }) => {
  await openNutrition(page);
  await col(page, '2026-09-25').getByRole('button', { name: 'Add to Lunch' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByText('Adding to Fri 25')).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Lunch' })).toHaveAttribute('aria-pressed', 'true');
  await closeSheet(page);
  await col(page, '2026-09-25').getByRole('button', { name: 'Add to Dinner' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Dinner' })).toHaveAttribute('aria-pressed', 'true');
  await closeSheet(page);
  await expect(todayCol(page).getByRole('button', { name: /^Add to / })).toHaveCount(0); // today logs eaten food, which has no meal
  await page.getByRole('button', { name: 'Previous week', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Add to / })).toHaveCount(0); // the week cannot be changed
});

test('the Calories, Protein and Fat bars are filled in their legend colours, and a bar past its target turns the over colour', async ({ page }) => {
  await page.evaluate(() => { // a goal weight and a weigh-in give the day its calorie and protein targets, so the bars have a width
    localStorage.setItem('ironlog:config/main', JSON.stringify({ bwGoal: { w: 180 } }));
    localStorage.setItem('ironlog:body/main', JSON.stringify({ schema: 1, entries: [{ wk: '2026-09-20', d: '2026-09-21', w: 170 }] }));
  });
  await page.reload();
  await openNutrition(page);
  const sheet = await openAdd(page, 'One-off food');
  await sheet.locator('#dt-add-n').fill('Rice');
  await sheet.locator('#dt-add-k').fill('300');
  await sheet.locator('#dt-add-p').fill('20');
  await sheet.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(sheet.getByRole('status').last()).toContainText('Added Rice');
  await closeSheet(page);
  const bg = l => l.evaluate(e => getComputedStyle(e).backgroundColor);
  const legend = cls => bg(page.locator(`.wb-legend i.${cls}`));
  const fill = name => bg(meter(todayCol(page), name).locator('i'));
  for (const [name, cls] of [['Calories', 'kcal'], ['Protein', 'prot']]) {
    expect(await fill(name), name).not.toBe('rgba(0, 0, 0, 0)');
    expect(await fill(name), name).toBe(await legend(cls));
    expect(await meter(todayCol(page), name).locator('i').evaluate(e => e.getBoundingClientRect().width), name).toBeGreaterThan(0);
  }
  const fat = todayCol(page).locator('.wb-meter.nb-fat i');
  if (await fat.count()) expect(await bg(fat)).toBe(await legend('fat'));
  const over = await openAdd(page, 'One-off food');
  await over.locator('#dt-add-n').fill('Feast');
  await over.locator('#dt-add-k').fill('5000');
  await over.locator('#dt-add-p').fill('10');
  await over.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(over.getByRole('status').last()).toContainText('Added Feast');
  await closeSheet(page);
  await expect(todayCol(page).locator('.wb-meter.nb-kcal')).toHaveClass(/\bover\b/);
  expect(await fill('Calories')).toBe(await legend('over'));
});

test('the Supplements meter sits before Water, fills as supplements are ticked, and says "None scheduled" with none', async ({ page }) => {
  await openNutrition(page);
  const bar = c => meter(c, 'Supplements').locator('i');
  const names = await todayCol(page).locator('.wb-bar .wb-barl span').allTextContents();
  expect(names.indexOf('Supplements')).toBeGreaterThan(-1);
  expect(names.indexOf('Supplements')).toBeLessThan(names.indexOf('Water'));
  await expect(meter(todayCol(page), 'Supplements')).toHaveAttribute('aria-label', 'Supplements taken: None scheduled');
  await expect(todayCol(page).locator('.wb-bar', { hasText: 'None scheduled' })).toBeVisible();
  await seedSupps(page);
  await openNutrition(page);
  await expect(meter(todayCol(page), 'Supplements')).toHaveAttribute('aria-label', 'Supplements taken: 0 of 2 taken');
  await page.locator(`[id="nb-supp-${TODAY}-creatine"]`).check();
  await expect(meter(todayCol(page), 'Supplements')).toHaveAttribute('aria-label', 'Supplements taken: 1 of 2 taken');
  expect(await bar(todayCol(page)).evaluate(e => e.style.width)).toBe('50%');
  await expect(col(page, '2026-09-26').locator('.wb-bar', { hasText: '0 of 2 taken' })).toBeVisible();
});

test('a sheet adds one Back step and Back closes it; the page keeps its address', async ({ page }) => {
  await openNutrition(page);
  const before = await hash(page);
  expect(before).toBe('#/daily/nutrition');
  await openAdd(page);
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await hash(page)).toBe('#/daily/nutrition');
  await openDrink(page, TODAY);
  await page.goBack();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await hash(page)).toBe('#/daily/nutrition');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 800 } });

  test('one day with a stepper: Next crosses into next week and stops at the end; no sideways scroll', async ({ page }) => {
    await openNutrition(page);
    await expect(page.locator('.nb-col')).toHaveCount(1);
    const step = page.getByRole('group', { name: 'Day stepper' });
    const pick = step.getByRole('combobox', { name: 'Day to show' });
    await expect(pick).toHaveValue(TODAY);
    expect(await pick.locator('optgroup').evaluateAll(g => g.map(x => x.label))).toEqual(['Last week', 'This week', 'Next week']);
    for (let i = 0; i < 7; i++) await step.getByRole('button', { name: 'Next day' }).click();
    await expect(pick).toHaveValue('2026-10-01');
    await expect(page.locator('.nb-weekname')).toHaveText('Next week');
    for (let i = 0; i < 2; i++) await step.getByRole('button', { name: 'Next day' }).click(); // a disabled button cannot be clicked, so stop at the last day
    await expect(pick).toHaveValue('2026-10-03'); // the Saturday that ends next week
    await expect(step.getByRole('button', { name: 'Next day' })).toHaveAttribute('aria-disabled', 'true');
    for (let i = 0; i < 20; i++) await step.getByRole('button', { name: 'Previous day' }).click(); // Oct 3 back to Sep 13
    await expect(pick).toHaveValue('2026-09-13'); // the Sunday that starts last week
    await expect(step.getByRole('button', { name: 'Previous day' })).toHaveAttribute('aria-disabled', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });

  test('the toolbar follows the stepper and every button is at least 44 px', async ({ page }) => {
    await openNutrition(page);
    await page.getByRole('group', { name: 'Day stepper' }).getByRole('button', { name: 'Next day' }).click();
    await expect(page.locator('.nb-target')).toHaveText('Adding to Fri 25');
    const small = await page.locator('.nb-toolbar .btn, .nb-step .btn, .nb-weeksw button, .nb-hydration button, .nb-tick').evaluateAll(els => els.filter(e => e.offsetParent).map(e => ({ n: e.textContent.trim(), h: e.getBoundingClientRect().height })).filter(x => x.h < 43.5));
    expect(small).toEqual([]);
  });

  for (const width of [375, 390]) {
    test(`header B and add-food A at ${width} px: Targets and Manage are text links under the day stepper, the week switcher has its row, Add food last in a row of four equal buttons, centered day text`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await openNutrition(page);
      const box = sel => page.locator(sel).first().evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, r: r.right }; });
      const targets = await box('#nb-targets'), manage = await box('#nb-manage');
      expect(await page.locator('#nb-targets').evaluate(e => e.innerText)).toBe('Targets'); // the short name on a phone; the accessible name stays Targets and goal
      expect(await page.locator('#nb-h').evaluate(e => e.getBoundingClientRect().width)).toBeLessThanOrEqual(1); // the Nutrition heading stays for screen readers but is not drawn: the tab already says it
      expect(Math.min(targets.h, manage.h)).toBeGreaterThanOrEqual(43.5);
      const add = await box('#nb-add');
      const three = await page.locator('.nb-tbtns .btn:not(#nb-add)').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { y: r.y, w: r.width, h: r.height }; }));
      expect(three).toHaveLength(3);
      expect(await page.locator('.nb-tbtns .btn').allInnerTexts()).toEqual(['Scan barcode', 'Quick add', 'One-off food', 'Add food']); // Add food is last, so it is the rightmost
      expect(three.every(t => Math.abs(t.y - add.y) < 1 && t.h >= 43.5 && Math.abs(t.w - add.w) < 1)).toBe(true); // one row, four equal buttons
      expect(add.x).toBeGreaterThan(await page.locator('.nb-tbtns .btn').nth(2).evaluate(e => e.getBoundingClientRect().x));
      expect(await page.locator('.nb-steppick').evaluate(e => getComputedStyle(e).textAlignLast)).toBe('center');
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    });
  }

  test('on a day ahead Add food shows with Recipes and Saved meals; on last week the food buttons are gone', async ({ page }) => {
    await openNutrition(page);
    const step = page.getByRole('group', { name: 'Day stepper' });
    await step.getByRole('button', { name: 'Next day' }).click();
    await expect(page.locator('#nb-add')).toBeVisible();
    await expect(page.locator('.nb-tbtns .btn')).toHaveText(['Recipes', 'Saved meals', 'Add food']);
    await step.getByRole('combobox', { name: 'Day to show' }).selectOption('2026-09-19');
    await expect(page.locator('#nb-add')).toHaveCount(0);
    await expect(page.getByText('Last week\'s food cannot be changed')).toBeVisible();
  });
});

test('on today the Recipes way only logs: Log is there, Plan is not', async ({ page }) => {
  await seedRecipes(page);
  await openNutrition(page);
  const sheet = await openAdd(page, 'Recipes');
  await expect(sheet.getByRole('button', { name: 'Log Chili' })).toBeVisible();
  await expect(sheet.getByRole('button', { name: /^Plan / })).toHaveCount(0);
});
