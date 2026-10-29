const { _electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const { createHistoryStore } = require('../electron/history.cjs');
(async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ava-history-desktop-'));
  const data = path.join(root, 'user-data');
  const output = path.join(root, 'Documents', 'Ava');
  const custom = path.join(root, 'chosen-folder');
  await fs.mkdir(custom);
  const store = createHistoryStore(data, output);
  for (let i = 0; i < 7; i++) {
    const record = await store.add({ sourcePath: path.join(root, `demo-${i}.wav`), language: 'fa', quality: 'fast', device: 'cpu', segments: [{ start: 0, end: 1000, text: 'متن آزمایشی' }] });
    const db = new DatabaseSync(path.join(data, 'history.sqlite'));
    const date = new Date();
    if (i < 3) date.setDate(date.getDate() - 1);
    date.setHours(10, i, 0, 0);
    db.prepare('UPDATE transcriptions SET created_at=? WHERE id=?').run(date.toISOString(), record.id);
    db.close();
  }
  store.close();
  const env = { ...process.env, AVA_TEST_DATA_DIR: data, AVA_TEST_SAVE_DIR: output };
  delete env.ELECTRON_RUN_AS_NODE;
  const launch = () => _electron.launch(process.env.AVA_TEST_EXE ? { executablePath: process.env.AVA_TEST_EXE, args: [], env } : { args: [path.join(__dirname, '..')], env });
  let app = await launch();
  try {
    let page = await app.firstWindow();
    await page.evaluate(() => { localStorage.setItem('ava-ui-language', 'en'); localStorage.setItem('ava-tour-seen-v1', 'true'); });
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.history-row').length === 5);
    await page.getByRole('button', { name: 'All history', exact: true }).click();
    await page.waitForFunction(() => document.querySelectorAll('.history-row').length === 7);
    assert.equal(await page.locator('.history-day').count(), 2);
    await page.locator('.history-row').first().click();
    const first = page.getByRole('textbox', { name: 'Passage 1', exact: true });
    await first.fill('ویرایش ذخیره‌شده');
    await page.getByRole('button', { name: 'Save changes', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Changes saved to history.' }).waitFor();
    const edited = (await page.evaluate(() => window.transcriber.historyList(50))).find(r => r.preview.includes('ویرایش'));
    assert.ok(edited);
    assert.match(await fs.readFile(path.join(edited.folder, 'transcript.txt'), 'utf8'), /ویرایش ذخیره‌شده/);
    await app.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, custom);
    await page.getByRole('button', { name: 'Settings / تنظیمات' }).click();
    await page.getByRole('button', { name: 'Change folder', exact: true }).click();
    await page.waitForFunction(value => document.querySelector('#save-folder-path')?.value === value, custom);
    await page.getByRole('button', { name: 'Settings / تنظیمات' }).click();
    let expectedCount = 7;
    if (process.env.AVA_TEST_AUDIO) {
      await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, process.env.AVA_TEST_AUDIO);
      await page.getByRole('button', { name: 'Change file', exact: true }).click();
      await page.evaluate(async () => {
        const result = await window.transcriber.downloadModel('large-v3-turbo-q5');
        if (result.models.find(m => m.id === 'large-v3-turbo-q5').status !== 'ready') throw new Error('Test model download failed.');
        await window.transcriber.selectModel('large-v3-turbo-q5');
      });
      await page.getByRole('button', { name: 'Transcribe recording', exact: true }).click();
      await page.getByRole('textbox', { name: 'Passage 1', exact: true }).waitFor({ timeout: 180000 });
      const saved = (await page.evaluate(() => window.transcriber.historyList(50))).find(r => r.name === path.basename(process.env.AVA_TEST_AUDIO));
      assert.ok(saved, 'Completed transcription was not added to history.');
      assert.ok(saved.folder.startsWith(custom + path.sep));
      for (const format of ['txt', 'srt', 'vtt']) assert.ok((await fs.stat(path.join(saved.folder, `transcript.${format}`))).size > 0);
      expectedCount = 8;
    }
    await app.close();
    app = await launch();
    page = await app.firstWindow();
    await page.getByRole('button', { name: 'Settings / تنظیمات' }).click();
    await page.waitForFunction(value => document.querySelector('#save-folder-path')?.value === value, custom);
    await page.getByRole('button', { name: 'Settings / تنظیمات' }).click();
    await page.getByRole('button', { name: 'All history', exact: true }).click();
    await page.waitForFunction(count => document.querySelectorAll('.history-row').length === count, expectedCount);
    assert.equal(await page.locator('.history-day').count(), 2);
    const header = (await fs.readFile(path.join(data, 'history.sqlite'))).subarray(0, 16).toString();
    assert.equal(header, 'SQLite format 3\u0000');
    console.log('History integration passed: latest five, date groups, reopen/edit/export, custom folder, automatic saving, restart persistence.');
  } finally {
    await app.close();
    if (path.dirname(path.resolve(root)) === path.resolve(os.tmpdir()) && path.basename(root).startsWith('ava-history-desktop-')) await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

