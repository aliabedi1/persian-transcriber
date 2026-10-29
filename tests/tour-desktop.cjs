const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ava-tour-'));
  const env = { ...process.env, AVA_TEST_DATA_DIR: path.join(root, 'data'), AVA_TEST_SAVE_DIR: path.join(root, 'exports') };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ args: [path.join(__dirname, '..')], env });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.locator('h1').waitFor();
    await page.evaluate(() => { localStorage.removeItem('ava-tour-seen-v1'); localStorage.setItem('ava-ui-language', 'en'); });
    await page.reload();
    const tour = page.getByRole('region', { name: 'User guide', exact: true });
    await tour.getByRole('heading', { name: 'Choose a recording' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Choose file', exact: true }).isEnabled(), true);
    await tour.getByRole('button', { name: 'Next', exact: true }).click();
    await tour.getByRole('heading', { name: 'Set the spoken language' }).waitFor();
    await tour.getByRole('button', { name: 'Previous' }).click();
    await tour.getByRole('heading', { name: 'Choose a recording' }).waitFor();
    for (let i = 0; i < 4; i++) await tour.getByRole('button', { name: 'Next', exact: true }).click();
    await page.getByRole('heading', { name: 'App settings', exact: true }).waitFor();
    await tour.getByRole('button', { name: 'Previous' }).click();
    await page.getByRole('heading', { name: 'Audio and video transcription', exact: true }).waitFor();
    await tour.getByRole('button', { name: 'Next', exact: true }).click();
    await tour.getByRole('button', { name: 'Finish tour' }).click();
    assert.equal(await tour.count(), 0);
    await page.reload();
    assert.equal(await tour.count(), 0);
    await page.getByRole('button', { name: 'User guide', exact: true }).click();
    await tour.getByRole('heading', { name: 'Choose a recording' }).waitFor();
    await tour.getByRole('button', { name: 'Skip tour' }).click();
    await page.reload();
    assert.equal(await tour.count(), 0);
    await page.evaluate(() => localStorage.setItem('ava-ui-language', 'fa'));
    await page.reload();
    await page.getByRole('button', { name: 'راهنمای استفاده', exact: true }).click();
    await page.getByRole('heading', { name: 'یک فایل انتخاب کنید' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.AVA_TOUR_SCREENSHOT) await page.screenshot({ path: process.env.AVA_TOUR_SCREENSHOT });
    await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('region', { name: 'راهنمای استفاده', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: 'راهنمای استفاده', exact: true }).evaluate(el => el === document.activeElement), true);
    assert.deepEqual(errors, []);
    console.log('Tour passed: first use, steps, previous, page changes, finish, skip, persistence, replay, Persian, mobile and Escape focus return.');
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
