// Real catalog downloads and native inference in an isolated copy/profile on the local PC.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const repo = path.resolve(__dirname, '..');
  const testRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ava-model-desktop-'));
  const appRoot = path.join(testRoot, 'app'), profile = path.join(testRoot, 'profile');
  await fs.mkdir(appRoot);
  await fs.cp(path.join(repo, 'electron'), path.join(appRoot, 'electron'), { recursive: true });
  await fs.cp(path.join(repo, 'dist'), path.join(appRoot, 'dist'), { recursive: true });
  await fs.writeFile(path.join(appRoot, 'package.json'), JSON.stringify({ name: 'ava-model-test', version: '1.0.0', main: 'electron/main.cjs' }));
  await fs.symlink(path.join(repo, 'runtime'), path.join(appRoot, 'runtime'), process.platform === 'win32' ? 'junction' : 'dir');
  const catalogPath = path.join(appRoot, 'electron/model-catalog.json');
  const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
  catalog.files.tiny = { name: 'ggml-tiny.bin', size: 77691713, sha256: 'be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21', urls: ['https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin'] };
  catalog.models.push({ id: 'developer-tiny', name: 'Developer Tiny', description: 'Added through catalog only.', engine: 'whisper.cpp-ggml-v1', modelFile: 'tiny', vadFile: 'silero-v5' });
  await fs.writeFile(catalogPath, JSON.stringify(catalog));
  const env = { ...process.env, AVA_TEST_DATA_DIR: profile, AVA_TEST_SAVE_DIR: path.join(testRoot, 'exports') };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, page;
  const errors = [];
  async function launch() {
    app = await electron.launch({ args: [appRoot], env });
    page = await app.firstWindow();
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluate(() => { localStorage.setItem('ava-ui-language', 'en'); localStorage.setItem('ava-tour-seen-v1', 'true'); });
    await page.reload();
    await page.getByRole('button', { name: 'Settings / تنظیمات' }).click();
    await page.getByRole('heading', { name: 'Models', exact: true }).waitFor();
  }
  async function download(name) {
    const section = page.getByRole('region', { name, exact: true });
    await section.getByRole('button', { name: /Download model|Retry download/ }).click();
    await section.getByRole('button', { name: 'Use model', exact: true }).waitFor({ timeout: 1800000 });
    console.log('Downloaded and verified:', name);
  }
  async function transcribe(id) {
    const name = id === 'large-v3-q5' ? 'Whisper Large v3 · Q5' : 'Whisper Large v3 Turbo · Q5';
    const section = page.getByRole('region', { name, exact: true });
    if (await section.getByRole('button', { name: 'Use model', exact: true }).count()) await section.getByRole('button', { name: 'Use model', exact: true }).click();
    await section.getByRole('button', { name: 'Selected', exact: true }).waitFor();
    const result = await page.evaluate(async () => {
      await window.transcriber.choose();
      const result = await window.transcriber.transcribe('fa', 'cpu');
      return { ...result, record: result.historyId ? await window.transcriber.historyGet(result.historyId) : null };
    });
    assert.equal(result.error, undefined, result.error);
    assert.ok(result.segments.length > 0);
    assert.equal(result.record.quality, id);
    console.log('Real Persian CPU transcription:', id, result.segments.length, 'passages');
  }
  try {
    await launch();
    assert.equal((await page.evaluate(() => window.transcriber.status())).ready, false);
    await page.getByText('A model is required', { exact: true }).waitFor();
    assert.equal((await page.evaluate(() => window.transcriber.models())).models.every(m => m.status === 'missing'), true);
    assert.deepEqual(await fs.readdir(path.join(profile, 'models')), []);
    console.log('Fresh startup: no model downloads, missing-model guidance visible.');
    // Inject a connection failure in the main process, then restore the real network for retry.
    await app.evaluate(() => { global.__originalFetch = global.fetch; global.fetch = async () => { throw new Error('Simulated disconnected network'); }; });
    const added = page.getByRole('region', { name: 'Developer Tiny', exact: true });
    await added.getByRole('button', { name: 'Download model', exact: true }).click();
    await added.getByRole('button', { name: 'Retry download', exact: true }).waitFor();
    await added.getByText('Check your connection and free disk space, then retry.', { exact: true }).waitFor();
    await app.evaluate(() => { global.fetch = global.__originalFetch; });
    await download('Developer Tiny');
    await download('Whisper Large v3 Turbo · Q5');
    await download('Whisper Large v3 · Q5');
    await app.evaluate(({ dialog }, fixture) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] }); }, path.join(repo, 'tests/fixtures/persian-fleurs.wav'));
    await transcribe('large-v3-turbo-q5');
    await transcribe('large-v3-q5');
    // Start with one model, then change the selection while the real job runs.
    await page.evaluate(async () => {
      await window.transcriber.selectModel('large-v3-q5');
      window.__receivedJobProgress = false;
      window.__stopModelProgress = window.transcriber.onProgress(() => { window.__receivedJobProgress = true; });
      window.__modelJob = window.transcriber.transcribe('fa', 'cpu');
    });
    await page.waitForFunction(() => window.__receivedJobProgress === true);
    await page.evaluate(() => window.transcriber.selectModel('large-v3-turbo-q5'));
    const active = await page.evaluate(async () => {
      const result = await window.__modelJob;
      window.__stopModelProgress();
      return { result, record: result.historyId ? await window.transcriber.historyGet(result.historyId) : null };
    });
    assert.equal(active.result.error, undefined);
    assert.equal(active.record.quality, 'large-v3-q5');
    await app.close(); app = null;
    await launch();
    const restarted = await page.evaluate(() => window.transcriber.models());
    assert.equal(restarted.selectedId, 'large-v3-turbo-q5');
    assert.ok(restarted.models.every(m => m.status === 'ready'));
    // Fail every main-process fetch, as well as browser networking, during inference.
    await app.evaluate(({ dialog }, fixture) => {
      global.fetch = async () => { throw new Error('Offline verification: network disabled'); };
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixture] });
    }, path.join(repo, 'tests/fixtures/persian-fleurs.wav'));
    await page.context().setOffline(true);
    await transcribe('large-v3-turbo-q5');
    await transcribe('large-v3-q5');
    assert.equal(await page.evaluate(async () => { try { await fetch('https://example.com'); return 'allowed'; } catch { return 'blocked'; } }), 'blocked');
    await page.evaluate(() => window.transcriber.selectModel('large-v3-turbo-q5'));
    // Refresh model selection in the UI, then capture English and Persian settings.
    await page.reload();
    await page.getByRole('button', { name: 'Settings / تنظیمات' }).click();
    await page.getByRole('region', { name: 'Whisper Large v3 Turbo · Q5' }).getByRole('button', { name: 'Selected', exact: true }).waitFor();
    const screenshot = process.env.AVA_MODELS_SCREENSHOT || path.join(os.tmpdir(), 'ava-models-settings.png');
    await page.screenshot({ path: screenshot, fullPage: true });
    console.log('SCREENSHOT', screenshot);
    await page.evaluate(() => localStorage.setItem('ava-ui-language', 'fa'));
    await page.reload();
    await page.getByRole('button', { name: 'Settings / تنظیمات' }).click();
    await page.getByRole('heading', { name: 'مدل‌ها', exact: true }).waitFor();
    await page.screenshot({ path: screenshot.replace('.png', '-fa.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS: fresh profile; three actual catalog downloads; connection failure/retry; two-model inference/switching; active-job selection isolation; restart; offline inference with both models; catalog-only addition; renderer isolation; English/Persian settings.');
  } finally {
    await app?.close();
    await fs.unlink(path.join(appRoot, 'runtime'));
    if (path.dirname(path.resolve(testRoot)) === path.resolve(os.tmpdir()) && path.basename(testRoot).startsWith('ava-model-desktop-')) await fs.rm(testRoot, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
