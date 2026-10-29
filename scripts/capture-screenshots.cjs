// Publish only a public demo sample in a disposable profile. No normal app data is read.
const { chooseSelect } = require('../tests/select-helper.cjs');
const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');

(async () => {
  if (!process.env.AVA_DEMO_AUDIO) throw new Error('Set AVA_DEMO_AUDIO to a public demo recording. Screenshots are published.');
  const repo = path.resolve(__dirname, '..');
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'ava-screenshots-'));
  const data = path.join(profile, 'data');
  const models = path.join(data, 'models');
  const output = path.resolve(process.env.AVA_SCREENSHOT_DIR || path.join(repo, 'docs/screenshots'));
  await fs.mkdir(models, { recursive: true }); await fs.mkdir(output, { recursive: true });
  const catalog = require('../electron/model-catalog.json');
  for (const file of Object.values(catalog.files)) {
    const original = path.join(repo, 'models', file.name);
    const destination = path.join(models, file.name);
    await fs.link(original, destination).catch(() => fs.copyFile(original, destination));
  }
  await fs.writeFile(path.join(models, 'selection.json'), JSON.stringify({ selectedId: 'large-v3-turbo-q5' }));
  const env = { ...process.env, AVA_TEST_DATA_DIR: data, AVA_TEST_SAVE_DIR: path.join(profile, 'exports') };
  delete env.ELECTRON_RUN_AS_NODE;
  const captureArgs = ['--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve(process.env.AVA_DEMO_AUDIO)}`];
  const app = await _electron.launch(process.env.AVA_TEST_EXE
    ? { executablePath: process.env.AVA_TEST_EXE, args: captureArgs, env }
    : { args: [repo, ...captureArgs], env });
  try {
    const page = await app.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => {
      localStorage.setItem('ava-ui-language', 'fa'); localStorage.setItem('ava-theme', 'light');
      localStorage.setItem('ava-tour-seen-v1', 'true'); localStorage.setItem('ava-device', 'auto');
    });
    await page.reload();
    async function shot(name) {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => !document.querySelector('.statusbar')?.textContent);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      await page.screenshot({ path: path.join(output, name), fullPage: true });
    }
    await page.getByRole('heading', { name: 'خانه', exact: true }).waitFor();
    await shot('home.png');
    await page.getByRole('button', { name: 'شروع تبدیل به متن', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('#live-source')?.disabled && !document.body.innerText.includes('یک مدل برای تبدیل لازم است'));
    await shot('persian-light.png');
    await page.getByRole('button', { name: 'شروع تبدیل زنده', exact: true }).click();
    await page.getByText('زنده · میکروفون', { exact: true }).waitFor({ timeout: 120000 });
    await page.getByRole('textbox', { name: 'بخش 1', exact: true }).waitFor({ timeout: 120000 });
    await shot('live-transcription.png');
    await page.getByRole('button', { name: 'توقف و ذخیره', exact: true }).click();
    await page.getByRole('button', { name: 'شروع تبدیل زنده', exact: true }).waitFor({ timeout: 120000 });
    const records = await page.evaluate(() => window.transcriber.historyList(5));
    assert.equal(records.length, 1); assert.ok(records[0].passageCount > 0);
    await chooseSelect(page, page.getByRole('combobox', { name: 'Appearance / ظاهر' }), 'dark');
    await page.waitForFunction(() => document.documentElement.classList.contains('dark'));
    await shot('persian-dark-transcript.png');
    await chooseSelect(page, page.getByRole('combobox', { name: 'Appearance / ظاهر' }), 'light');
    await page.getByRole('button', { name: 'سوابق', exact: true }).click();
    await page.locator('.history-day').waitFor();
    await shot('history.png');
    await page.getByRole('button', { name: 'Settings / تنظیمات' }).click();
    await page.getByRole('heading', { name: 'مدل‌ها', exact: true }).waitFor();
    await shot('models.png');
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.locator('.error-detail').allTextContents(), []);
    console.log('Captured six current-version screenshots with real local Persian recognition and disposable history.');
  } finally {
    await app.close();
    if (path.dirname(path.resolve(profile)) === path.resolve(os.tmpdir()) && path.basename(profile).startsWith('ava-screenshots-')) await fs.rm(profile, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
