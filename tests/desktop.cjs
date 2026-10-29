const { chooseSelect } = require('./select-helper.cjs');
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
(async () => {
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ava-desktop-check-'));
  const launchEnv = { ...process.env, AVA_TEST_DATA_DIR: path.join(testRoot, 'data'), AVA_TEST_SAVE_DIR: path.join(testRoot, 'exports') };
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch(process.env.AVA_TEST_EXE
    ? { executablePath: process.env.AVA_TEST_EXE, args: [], env: launchEnv }
    : { args: [path.join(__dirname, '..')], env: launchEnv });
  let savedTheme, page;
  try {
    page = await app.firstWindow();
    savedTheme = await page.evaluate(() => localStorage.getItem('ava-theme'));
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.getByRole('button', { name: 'Settings / تنظیمات' }).waitFor();
    await page.evaluate(() => localStorage.removeItem('ava-ui-language'));
    await page.reload();
    await page.getByRole('heading', { name: 'تبدیل صدا و ویدیو به متن' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'fa');
    if (process.env.AVA_RTL_SCREENSHOT) await page.screenshot({ path: process.env.AVA_RTL_SCREENSHOT });
    await chooseSelect(page, page.getByRole('combobox', { name: 'Interface language / زبان برنامه' }), 'en');
    assert.equal(await page.evaluate(() => document.documentElement.dir), 'ltr');
    await page.reload();
    await page.getByRole('heading', { name: 'Audio and video transcription' }).waitFor();
    assert.equal((await page.evaluate(() => window.transcriber.status())).ready, true);
    assert.equal(await page.getByRole('button', { name: 'Transcribe recording', exact: true }).isDisabled(), true);
    await page.evaluate(() => { localStorage.setItem('ava-theme', 'light') });
    await page.reload();
    await chooseSelect(page, page.getByRole('combobox', { name: 'Appearance / ظاهر' }), 'dark');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
    await page.reload();
    await page.getByRole('button', { name: 'Settings / تنظیمات' }).waitFor();
    await chooseSelect(page, page.getByRole('combobox', { name: 'Appearance / ظاهر' }), 'light');
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), false);
    const remote = await page.evaluate(async () => { try { await fetch('https://example.com'); return 'allowed'; } catch { return 'blocked'; } });
    assert.equal(remote, 'blocked');
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    if (process.env.AVA_SCREENSHOT) await page.screenshot({ path: process.env.AVA_SCREENSHOT });
    // Actual main-process file selection and inference, with only the native dialog stubbed.
    const fixture = process.env.AVA_TEST_AUDIO;
    if (fixture) {
      await app.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }); }, fixture);
      await page.getByRole('button', { name: 'Choose file', exact: true }).click();
      await page.getByRole('button', { name: 'Transcribe recording', exact: true }).click();
      await page.getByRole('textbox', { name: 'Passage 1', exact: true }).waitFor({ timeout: 180000 });
      const detected = await page.evaluate(() => window.transcriber.status());
      const savedRows = await page.evaluate(() => window.transcriber.historyList(1));
      const stored = await page.evaluate(id => window.transcriber.historyGet(id), savedRows[0].id);
      assert.equal(stored.device, detected.gpu.available ? 'gpu' : 'cpu');
      console.log('PERSIAN_RESULT', await page.getByRole('textbox', { name: 'Passage 1', exact: true }).inputValue());
      await page.getByRole('textbox', { name: 'Passage 1', exact: true }).fill('سلام، این متن ویرایش شده است.');
      await page.getByRole('button', { name: 'Copy', exact: true }).click();
      assert.match(await app.evaluate(({ clipboard }) => clipboard.readText()), /ویرایش شده/);
      for (const format of ['txt', 'srt', 'vtt']) {
        const destination = path.join(os.tmpdir(), `ava-desktop-test.${format}`);
        await app.evaluate(({ dialog }, destination) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination }); }, destination);
        await page.getByRole('button', { name: format.toUpperCase(), exact: true }).click();
        await page.waitForFunction(expected => document.querySelector('[role="status"]').textContent.includes(expected), `${format.toUpperCase()} saved`);
        assert.match(await fs.readFile(destination, 'utf8'), /ویرایش شده/);
        await fs.rm(destination);
      }
      await page.getByRole('button', { name: 'Transcribe recording', exact: true }).click();
      await page.getByRole('button', { name: 'Cancel transcription', exact: true }).click();
      await page.getByText('Transcription cancelled.', { exact: true }).waitFor();
      const bad = path.join(os.tmpdir(), 'ava-invalid-media.mp3');
      await fs.writeFile(bad, 'This is not audio.');
      await app.evaluate(({ dialog }, selected) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] }); }, bad);
      await page.getByRole('button', { name: 'Change file', exact: true }).click();
      await page.getByRole('button', { name: 'Transcribe recording', exact: true }).click();
      await page.getByText(/Process exited/).waitFor();
      await fs.rm(bad);
    }
    await chooseSelect(page, page.getByRole('combobox', { name: 'Interface language / زبان برنامه' }), 'fa');
    assert.deepEqual(errors, []);
    console.log('Desktop integration passed: readiness, IPC, renderer isolation, network blocking' + (fixture ? ', Persian inference, editing, clipboard, TXT/SRT/VTT.' : '.'));
  } finally {
    if (page && savedTheme !== undefined) await page.evaluate(value => { if (value === null) localStorage.removeItem('ava-theme'); else localStorage.setItem('ava-theme', value); }, savedTheme).catch(() => {});
    await app.close();
    if (path.dirname(path.resolve(testRoot)) === path.resolve(os.tmpdir()) && path.basename(testRoot).startsWith('ava-desktop-check-')) await fs.rm(testRoot, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
