import { test, expect } from './fixtures.js';

// A day's title lines up with the day's tick box until a date is stamped; stamping lifts it above the date, and the header does not change size.
const phone = async page => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator('.col.sel article.card').first()).toBeVisible();
};
const centers = page => page.evaluate(() => {
  const head = document.querySelector('.col.sel .colhead');
  const mid = el => { const r = el.getBoundingClientRect(); return r.top + r.height / 2; };
  return {
    box: mid(head.querySelector('input.chk')),
    title: mid(head.querySelector('h3')),
    headHeight: head.getBoundingClientRect().height,
    stamped: !!head.querySelector('.dd-text'),
  };
});

test('before a date is stamped the day title is level with the day box; stamping lifts it and changes no height', async ({ page }) => {
  await phone(page);
  const before = await centers(page);
  expect(before.stamped).toBe(false);
  expect(Math.abs(before.title - before.box)).toBeLessThan(2);

  await page.locator('.col.sel article.card input.chk[id^="chk-"]').first().check(); // logging a day stamps its date
  await expect(page.locator('.col.sel .colhead .dd-text')).toBeVisible();
  const after = await centers(page);
  expect(after.title).toBeLessThan(after.box - 8); // above the box now, with the date under it
  expect(Math.abs(after.headHeight - before.headHeight)).toBeLessThan(0.5); // the header did not grow or shrink
});

test('a day with a subtitle under its date room keeps its title where it was (the title only drops when the room is the last thing)', async ({ page }) => {
  await phone(page);
  const h3 = page.locator('.col.sel .colhead h3');
  await expect(h3).not.toHaveCSS('transform', 'none'); // no subtitle: it drops
  await page.locator('.col.sel .colhead .daydate').evaluate(el => { const sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = 'Push'; el.after(sub); }); // what dayDef.sub renders
  await expect(h3).toHaveCSS('transform', 'none');
});
