const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const repo = path.resolve(__dirname, '..');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ava-live-test-'));
  const appRoot = path.join(root, 'app');
  const real = process.env.AVA_TEST_LIVE_REAL === '1';
  const source = process.argv[2] || process.env.AVA_TEST_LIVE_SOURCE || 'microphone';
  const device = process.env.AVA_TEST_LIVE_DEVICE || 'cpu';
  await fs.mkdir(appRoot);
  await fs.cp(path.join(repo, 'electron'), path.join(appRoot, 'electron'), { recursive: true });
  await fs.cp(path.join(repo, 'dist'), path.join(appRoot, 'dist'), { recursive: true });
  await fs.writeFile(path.join(appRoot, 'package.json'), JSON.stringify({ name: 'ava-live-test', main: 'electron/main.cjs' }));
  await fs.symlink(path.join(repo, 'runtime'), path.join(appRoot, 'runtime'), process.platform === 'win32' ? 'junction' : 'dir');
  await fs.appendFile(path.join(appRoot, 'electron/models.cjs'), `
module.exports.createModelStore = () => ({
  list: () => ({ selectedId: 'test', models: [{ id: 'test', name: 'Test model', status: 'ready', size: 0, percent: 100 }] }),
  resolveSelected: async () => ({ id: 'test', modelPath: ${JSON.stringify(path.join(repo, 'models/ggml-large-v3-turbo-q5_0.bin'))}, vadPath: ${JSON.stringify(path.join(repo, 'models/ggml-silero-v5.1.2.bin'))} })
});
`);
  if (!real) await fs.appendFile(path.join(appRoot, 'electron/live-engine.cjs'), `
module.exports.createLiveEngine = async () => { await new Promise(resolve => setTimeout(resolve, 400)); return { close: async () => {}, transcribe: async pcm => {
  await new Promise(resolve => setTimeout(resolve, 100));
  if (!pcm.some(byte => byte !== 0)) return [];
  return [{ start: 100, end: pcm.length / 32 - 50, text: 'سلام از تبدیل زنده ' + pcm.length }];
} }; };
`);
  const env = { ...process.env, AVA_TEST_DATA_DIR: path.join(root, 'data'), AVA_TEST_SAVE_DIR: path.join(root, 'exports') };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    app = await electron.launch({ args: [appRoot, '--use-fake-device-for-media-stream',
      ...(real ? [`--use-file-for-fake-audio-capture=${path.join(repo, 'tests/fixtures/persian-fleurs.wav')}`] : [])], env });
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(device => { localStorage.setItem('ava-device', device); localStorage.setItem('ava-ui-language', 'en'); localStorage.setItem('ava-tour-seen-v1', 'true'); }, device);
    await page.reload();
    await page.getByRole('button', { name: 'Start transcription', exact: true }).click();
    await page.evaluate(() => {
      window.testTracks = [];
      for (const method of ['getUserMedia', 'getDisplayMedia']) {
        const original = navigator.mediaDevices[method].bind(navigator.mediaDevices);
        navigator.mediaDevices[method] = async options => {
          const stream = await original(options); window.testTracks.push(...stream.getTracks()); return stream;
        };
      }
    });
    if (source !== 'microphone') {
      await page.locator('#live-source').click();
      await page.getByRole('option', { name: source === 'both' ? 'Microphone + system audio' : 'System / meeting audio', exact: true }).click();
      // Play a known public fixture through the actual output device for loopback.
      const bytes = await fs.readFile(path.join(repo, 'tests/fixtures/persian-fleurs.wav'));
      await page.evaluate(async bytes => {
        const audio = new Audio(URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'audio/wav' })));
        audio.loop = true; audio.volume = 0.15; window.testPlayback = audio; await audio.play();
      }, [...bytes]);
    }
    await page.getByRole('button', { name: 'Start live transcription', exact: true }).click();
    const activeLabel = source === 'microphone' ? 'Live · microphone' : source === 'both' ? 'Live · microphone + system' : 'Live · system audio';
    await page.getByText(activeLabel, { exact: true }).waitFor({ timeout: 120000 });
    assert.equal(await page.getByRole('button', { name: 'Home', exact: true }).isDisabled(), true);
    // A passage must arrive while recording is still active.
    await page.getByRole('textbox', { name: 'Passage 1', exact: true }).waitFor({ timeout: 120000 });
    assert.equal(await page.getByRole('button', { name: 'Stop and save', exact: true }).isEnabled(), true);
    await page.getByRole('button', { name: 'Pause live', exact: true }).click();
    await page.getByText('Paused', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Resume live', exact: true }).click();
    await page.getByText(activeLabel, { exact: true }).waitFor();
    if (process.env.AVA_LIVE_SCREENSHOT) await page.screenshot({ path: process.env.AVA_LIVE_SCREENSHOT, fullPage: true });
    await page.getByRole('button', { name: 'Stop and save', exact: true }).click();
    await page.getByRole('button', { name: 'Start live transcription', exact: true }).waitFor({ timeout: 120000 });
    const rows = await page.evaluate(() => window.transcriber.historyList(5));
    assert.equal(rows.length, 1); assert.ok(rows[0].passageCount > 0);
    assert.match(rows[0].name, /Live transcription/);
    const stored = await page.evaluate(id => window.transcriber.historyGet(id), rows[0].id);
    assert.match(stored.sourcePath, /^ava-live:/, 'a live session never pretends to retain an audio file');
    assert.equal(await page.evaluate(() => window.testTracks.every(track => track.readyState === 'ended')), true, 'stop releases every input and display track');
    for (const ext of ['txt', 'srt', 'vtt']) assert.ok((await fs.stat(path.join(rows[0].folder, `transcript.${ext}`))).size > 0);
    assert.deepEqual(errors, []);
    const errorText = await page.locator('.error-detail').allTextContents();
    assert.deepEqual(errorText, []);
    if (real) {
      const record = await page.evaluate(id => window.transcriber.historyGet(id), rows[0].id);
      assert.match(record.text, /[\u0600-\u06ff]/, 'real Persian speech must be recognized');
    }
    if (source === 'microphone' && !real) {
      const previous = await page.getByRole('textbox', { name: 'Passage 1', exact: true }).inputValue();
      await page.getByRole('button', { name: 'Start live transcription', exact: true }).click();
      await page.getByText('Loading live model…', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Stop and save', exact: true }).click();
      await page.getByRole('button', { name: 'Start live transcription', exact: true }).waitFor();
      assert.equal(await page.getByRole('textbox', { name: 'Passage 1', exact: true }).inputValue(), previous);
      assert.equal((await page.evaluate(() => window.transcriber.historyList(5))).length, 1, 'cancelled startup does not create an empty history record');
      await page.evaluate(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Denied', 'NotAllowedError'); }; });
      await page.getByRole('button', { name: 'Start live transcription', exact: true }).click();
      await page.getByText('Microphone access was denied. Allow it in system privacy settings, then retry.', { exact: true }).waitFor();
      assert.equal((await page.evaluate(() => window.transcriber.historyList(5))).length, 1, 'denied capture does not overwrite the completed transcript');
    }
    if (process.env.AVA_LIVE_SCREENSHOT) {
      await page.evaluate(() => localStorage.setItem('ava-ui-language', 'fa'));
      await page.reload();
      await page.getByRole('button').filter({ hasText: rows[0].name }).first().click();
      await page.getByRole('textbox', { name: 'بخش 1', exact: true }).waitFor();
      await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 860, height: 850 }));
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
      await page.screenshot({ path: process.env.AVA_LIVE_SCREENSHOT.replace(/\.png$/, '-persian.png'), fullPage: true });
    }
    console.log(`Live ${source} passed: AudioWorklet capture with nonzero PCM, incremental transcript, pause/resume, track cleanup and history/exports. Recognition ${real ? `REAL ${device.toUpperCase()}` : 'stubbed'}.`);
  } finally {
    await app?.close();
    // Do not recurse across the runtime junction into the real checkout.
    await fs.unlink(path.join(appRoot, 'runtime')).catch(() => {});
    if (path.dirname(root) === os.tmpdir() && path.basename(root).startsWith('ava-live-test-')) await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
