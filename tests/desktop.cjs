const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');
(async () => {
  const launchEnv = { ...process.env };
  delete launchEnv.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch(process.env.AVA_TEST_EXE
    ? { executablePath: process.env.AVA_TEST_EXE, args: [], env: launchEnv }
    : { args: [path.join(__dirname, '..')], env: launchEnv });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.getByRole('heading', { name: 'Give your recordings a voice in text.' }).waitFor();
    assert.equal((await page.evaluate(() => window.transcriber.status())).ready, true);
    assert.equal(await page.getByRole('button', { name: 'Transcribe recording', exact: true }).isDisabled(), true);
    await page.evaluate(() => { localStorage.setItem('ava-theme', 'light') });
    await page.reload();
    await page.getByRole('button', { name: 'Switch to dark mode' }).click();
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), true);
    await page.reload();
    await page.getByRole('button', { name: 'Switch to light mode' }).waitFor();
    await page.getByRole('button', { name: 'Switch to light mode' }).click();
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
    assert.deepEqual(errors, []);
    console.log('Desktop integration passed: readiness, IPC, renderer isolation, network blocking' + (fixture ? ', Persian inference, editing, clipboard, TXT/SRT/VTT.' : '.'));
  } finally { await app.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
