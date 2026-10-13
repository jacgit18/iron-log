import AxeBuilder from '@axe-core/playwright';
import { test, expect } from './fixtures.js';

const scan = page => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
const rows = page => page.locator('.edpanel:not(.lib) .edrow');
const names = page => rows(page).locator('.edmain b').allTextContents();

// Drags row `from`'s handle until its middle is just past row `to`'s middle, in small steps like a hand would.
async function drag(page, from, to, { release = true } = {}) {
  await rows(page).nth(Math.min(from, to)).evaluate(el => el.scrollIntoView({ block: 'center' })); // away from the edges, where the page scrolls
  const h = await rows(page).nth(from).locator('.draghandle').boundingBox();
  const a = await rows(page).nth(from).boundingBox(); const b = await rows(page).nth(to).boundingBox();
  const x = h.x + h.width / 2; const y = h.y + h.height / 2;
  const dy = (b.y + b.height / 2) - (a.y + a.height / 2) + (to > from ? 8 : -8);
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps: 12 });
  if (release) await page.mouse.up();
}

test('you drag an exercise to a new place in the day, and it stays there after a reload', async ({ page }) => {
  await page.click('#tab-program');
  await expect(rows(page).first()).toBeVisible(); // the tab is its own chunk, fetched on first open
  const before = await names(page);
  await drag(page, 0, 2);
  const want = [before[1], before[2], before[0], ...before.slice(3)];
  await expect.poll(() => names(page)).toEqual(want);
  await drag(page, 3, 1);
  const want2 = [want[0], want[3], want[1], want[2], ...want.slice(4)];
  await expect.poll(() => names(page)).toEqual(want2);
  await page.reload(); await page.click('#tab-program');
  await expect.poll(() => names(page)).toEqual(want2);
});

test('Escape during a drag puts the exercise back', async ({ page }) => {
  await page.click('#tab-program');
  await expect(rows(page).first()).toBeVisible(); // the tab is its own chunk, fetched on first open
  const before = await names(page);
  await drag(page, 0, 2, { release: false });
  await expect(rows(page).first()).toHaveClass(/dragging/);
  await expect(rows(page).nth(1)).toHaveClass(/shifting/);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(page.locator('.edrow.dragging')).toHaveCount(0);
  expect(await names(page)).toEqual(before);
});

test('the program editor with drag handles has no accessibility violations', async ({ page }) => {
  await page.click('#tab-program');
  await expect(page.locator('.draghandle').first()).toBeVisible();
  const { violations } = await scan(page);
  expect(violations.map(v => `${v.id}: ${v.nodes.map(n => n.target.join(' ')).slice(0, 3).join(', ')}`)).toEqual([]);
});

test('Remove marks the row first, a second tap removes it, and Undo puts it back in its place', async ({ page }) => {
  await page.click('#tab-program');
  const add = page.locator('.edpanel:not(.lib) .edadd').getByRole('button', { name: '+ Add exercise' });
  const addBox = await add.boundingBox(); const firstBox = await rows(page).first().boundingBox();
  expect(addBox.y).toBeLessThan(firstBox.y); // above the day's first exercise
  const before = await names(page);
  const rm = rows(page).nth(2).getByRole('button', { name: `Remove ${before[2]}` });
  await rm.click();
  await expect(rows(page).nth(2)).toHaveClass(/removing/);
  await expect(rows(page).nth(2)).toContainText('Will be removed');
  await expect(rm).toHaveText('Tap again to remove');
  expect((await scan(page)).violations).toEqual([]);
  await rm.click();
  await expect.poll(() => names(page)).toEqual([...before.slice(0, 2), ...before.slice(3)]);
  const note = page.locator('.removednote');
  await expect(note).toContainText(`Removed ${before[2]}`);
  await expect(note.getByRole('button', { name: 'Undo' })).toBeFocused();
  await note.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => names(page)).toEqual(before);
  await expect(note).toHaveCount(0);
});

test('moving away from an armed Remove leaves the exercise alone', async ({ page }) => {
  await page.click('#tab-program');
  await expect(rows(page).first()).toBeVisible(); // the tab is its own chunk, fetched on first open
  const before = await names(page);
  await rows(page).first().getByRole('button', { name: `Remove ${before[0]}` }).click();
  await expect(page.locator('.edrow.removing')).toHaveCount(1);
  await page.locator('#ed-title').click();
  await expect(page.locator('.edrow.removing')).toHaveCount(0);
  expect(await names(page)).toEqual(before);
});

test('the Removed notice belongs to that visit: leave the Program tab and it is gone, with focus left alone', async ({ page }) => {
  await page.click('#tab-program');
  await expect(rows(page).first()).toBeVisible(); // the tab is its own chunk, fetched on first open
  const before = await names(page);
  const rm = rows(page).first().getByRole('button', { name: `Remove ${before[0]}` });
  await rm.click(); await rm.click();
  await expect(page.locator('.removednote')).toBeVisible();
  await page.click('#tab-board');
  await page.click('#tab-program');
  await expect(page.locator('.removednote')).toHaveCount(0);
  await expect(page.locator('#tab-program')).toBeFocused();
});
