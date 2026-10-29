const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const { mkdtemp, writeFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'ava-dashboard-'));
  const recording = path.join(root, 'my-recording.wav');
  await writeFile(recording, 'dashboard file-selection fixture');
  const env = { ...process.env, AVA_TEST_DATA_DIR: path.join(root, 'data'), AVA_TEST_SAVE_DIR: path.join(root, 'exports') };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await _electron.launch({ args: [path.join(__dirname, '..')], env });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.locator('h1').waitFor();
    await page.evaluate(() => { localStorage.setItem('ava-ui-language', 'en'); localStorage.setItem('ava-tour-seen-v1', 'true'); localStorage.setItem('ava-theme', 'light'); });
    await page.reload();
    const home = () => page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'From recording to words, with Ava' }).waitFor();
    await page.getByText(path.join(root, 'exports'), { exact: true }).waitFor();
    if (process.env.AVA_DASHBOARD_SCREENSHOT) await page.screenshot({ path: process.env.AVA_DASHBOARD_SCREENSHOT });
    await page.getByRole('button', { name: 'View history', exact: true }).click();
    await page.getByRole('heading', { name: 'Transcription history', exact: true }).first().waitFor();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Workspace settings', exact: true }).click();
    await page.getByRole('combobox', { name: 'Appearance / ظاهر' }).waitFor();
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('heading', { name: 'Home', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Start transcription', exact: true }).click();
    await page.getByRole('heading', { name: 'Audio and video transcription', exact: true }).waitFor();
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, recording);
    await page.getByRole('button', { name: 'Choose file', exact: true }).click();
    await page.getByText('my-recording.wav', { exact: true }).waitFor();
    await home();
    await page.getByText('Open recording: my-recording.wav', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Continue recording', exact: true }).click();
    await page.getByText('my-recording.wav', { exact: true }).waitFor();
    await home();
    await page.getByRole('button', { name: 'Take a quick tour', exact: true }).click();
    await page.getByRole('heading', { name: 'Welcome to Ava' }).waitFor();
    await page.getByRole('button', { name: 'Skip tour', exact: true }).click();
    await page.evaluate(() => { localStorage.setItem('ava-ui-language', 'fa'); localStorage.setItem('ava-theme', 'dark'); });
    await page.reload();
    await page.getByRole('heading', { name: 'از صدا به متن، با آوا' }).waitFor();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (process.env.AVA_DASHBOARD_MOBILE_SCREENSHOT) await page.screenshot({ path: process.env.AVA_DASHBOARD_MOBILE_SCREENSHOT, fullPage: true });
    assert.deepEqual(errors, []);
    console.log('Dashboard passed: launch, history, settings, start, file selection, resume, tour, Persian/English, light/dark and mobile overflow.');
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
