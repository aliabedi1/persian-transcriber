const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { chooseSelect } = require('./select-helper.cjs');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ava-select-'));
  const env = { ...process.env, AVA_TEST_DATA_DIR: root };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch(process.env.AVA_TEST_EXE ? { executablePath: process.env.AVA_TEST_EXE, args: [], env } : { args: [path.join(__dirname, '..')], env });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const quality = page.locator('#quality');
    await page.getByRole('button', { name: 'Settings / تنظیمات' }).click();
    await quality.waitFor();
    await quality.focus();
    await quality.press('ArrowDown');
    await page.getByRole('listbox').waitFor();
    assert.equal(await page.getByRole('listbox').evaluate(el => getComputedStyle(el).direction), 'rtl');
    await page.screenshot({ animations: 'disabled', path: path.join(__dirname, '../release/select-fa-light.png') });
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    assert.equal(await quality.getAttribute('data-value'), 'fast');
    await page.waitForFunction(() => document.activeElement?.id === 'quality');
    await quality.click();
    await page.keyboard.press('Home');
    await page.keyboard.press('Escape');
    assert.equal(await quality.getAttribute('data-value'), 'fast');
    await page.reload();
    await page.getByRole('button', { name: 'Settings / تنظیمات' }).click();
    assert.equal(await quality.getAttribute('data-value'), 'fast');
    await chooseSelect(page, page.getByRole('combobox', { name: 'Interface language / زبان برنامه' }), 'en');
    await chooseSelect(page, page.getByRole('combobox', { name: 'Appearance / ظاهر' }), 'dark');
    await quality.click();
    assert.equal(await page.getByRole('listbox').evaluate(el => getComputedStyle(el).direction), 'ltr');
    await page.screenshot({ animations: 'disabled', path: path.join(__dirname, '../release/select-en-dark.png') });
    await page.keyboard.press('Escape');
    // Outside click dismisses without changing the value.
    await quality.click();
    await page.locator('h1').click();
    await page.getByRole('listbox').waitFor({ state: 'hidden' });
    await page.locator('#processor').click();
    const gpuAvailable = (await page.evaluate(() => window.transcriber.status())).gpu.available;
    assert.equal(await page.locator('[role="option"][data-value="gpu"]').getAttribute('aria-disabled'), gpuAvailable ? null : 'true');
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 844 });
    await quality.click();
    await page.getByRole('listbox').waitFor();
    const popup = await page.getByRole('listbox').boundingBox();
    assert.ok(popup.x >= 0 && popup.x + popup.width <= 391);
    await page.screenshot({ animations: 'disabled', path: path.join(__dirname, '../release/select-mobile.png') });
    assert.deepEqual(errors, []);
    console.log('Custom select checks passed: keyboard, Escape, focus return, outside click, persistence, RTL/LTR, dark/light, GPU availability and narrow viewport.');
  } finally {
    await app.close();
    if (path.dirname(root) === os.tmpdir() && path.basename(root).startsWith('ava-select-')) await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });


