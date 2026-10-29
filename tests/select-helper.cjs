async function openSettings(page) {
  await page.getByRole('button', { name: 'Settings / تنظیمات' }).click();
}
// Exercise the visible popup, rather than the hidden form input.
async function chooseSelect(page, trigger, value) {
  const navigated = !(await trigger.isVisible());
  if (navigated) await openSettings(page);
  await trigger.click();
  const popupId = await trigger.getAttribute('aria-controls');
  await page.locator(`[role="option"][data-value="${value}"]`).click();
  if (popupId) await page.locator(`[id="${popupId}"]`).waitFor({ state: 'hidden' });
  if (navigated) await openSettings(page);
}
module.exports = { chooseSelect, openSettings };
