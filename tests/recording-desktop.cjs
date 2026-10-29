// Real Chromium audio capture, permissions, IPC, FFmpeg decoding and history/exports.
// Only speech recognition and model availability are stubbed in an isolated app copy.
const { _electron: electron } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const repo = path.resolve(__dirname, '..');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ava-recording-test-'));
  const appRoot = path.join(root, 'app');
  const real = process.env.AVA_TEST_RECORDING_REAL === '1';
  await fs.mkdir(appRoot);
  await fs.cp(path.join(repo, 'electron'), path.join(appRoot, 'electron'), { recursive: true });
  await fs.cp(path.join(repo, 'dist'), path.join(appRoot, 'dist'), { recursive: true });
  await fs.writeFile(path.join(appRoot, 'package.json'), JSON.stringify({ name: 'ava-recording-test', main: 'electron/main.cjs' }));
  const ffmpeg = path.join(repo, require('../electron/engine.cjs').runtimePaths('').ffmpeg);
  if (!real) await fs.appendFile(path.join(appRoot, 'electron/engine.cjs'), `
module.exports.detectGpu = async () => ({ available: false, name: 'Test CPU' });
module.exports.transcribe = async ({ input, signal, onProgress }) => {
  onProgress({ stage: 'Preparing audio', percent: 0 });
  await run(${JSON.stringify(ffmpeg)}, ['-nostdin', '-v', 'error', '-i', input, '-f', 'null', '-'], { signal });
  onProgress({ stage: 'Transcribing locally', percent: 50 });
  await new Promise(resolve => setTimeout(resolve, 500));
  if (signal.aborted) throw new Error('Cancelled');
  return { segments: [{ start: 0, end: 1000, text: 'سلام از میکروفون' }] };
};
`);
  await fs.appendFile(path.join(appRoot, 'electron/models.cjs'), `
module.exports.createModelStore = () => ({
  list: () => ({ selectedId: 'test', models: [{ id: 'test', name: 'Test model', description: '', size: 0, status: 'ready', percent: 100 }] }),
  resolveSelected: async () => ({ id: 'test', modelPath: ${JSON.stringify(path.join(repo, 'models/ggml-large-v3-turbo-q5_0.bin'))}, vadPath: ${JSON.stringify(path.join(repo, 'models/ggml-silero-v5.1.2.bin'))} })
});
`);
  // Mark native tools ready; decoding uses the actual repository FFmpeg above.
  const runtime = require('../electron/engine.cjs').runtimePaths(appRoot);
  if (real) await fs.symlink(path.join(repo, 'runtime'), path.join(appRoot, 'runtime'), process.platform === 'win32' ? 'junction' : 'dir');
  else for (const file of [runtime.cpu, runtime.ffmpeg]) { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, 'test'); }
  const env = { ...process.env, AVA_TEST_DATA_DIR: path.join(root, 'data'), AVA_TEST_SAVE_DIR: path.join(root, 'exports') };
  delete env.ELECTRON_RUN_AS_NODE;
  let app, recordingPath;
  try {
    const args = [appRoot, '--use-fake-device-for-media-stream'];
    if (real) args.push(`--use-file-for-fake-audio-capture=${path.join(repo, 'tests/fixtures/persian-fleurs.wav')}`);
    app = await electron.launch({ args, env });
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluate(() => { localStorage.setItem('ava-device', 'cpu'); localStorage.setItem('ava-ui-language', 'en'); localStorage.setItem('ava-tour-seen-v1', 'true'); });
    await page.reload();
    await page.getByRole('button', { name: 'Start transcription', exact: true }).click();
    const record = page.getByRole('button', { name: 'Record from microphone', exact: true });
    await record.click();
    await page.getByText('Recording', { exact: true }).waitFor({ timeout: 15000 });
    assert.equal(await page.getByRole('button', { name: 'Choose file', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Home', exact: true }).isDisabled(), true);
    assert.equal(await page.getByRole('button', { name: 'Transcribe recording', exact: true }).isDisabled(), true);
    await page.waitForFunction(() => document.querySelector('section[aria-label="Microphone recording"] span[dir="ltr"]')?.textContent !== '00:00');
    if (real) await page.waitForFunction(() => document.querySelector('section[aria-label="Microphone recording"] span[dir="ltr"]')?.textContent === '00:11');
    await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
    await page.getByText('Recording ready. Select Transcribe recording to continue.', { exact: true }).waitFor();
    await page.waitForFunction(() => !document.querySelector('[data-tour="start"]').disabled);
    if (process.env.AVA_RECORDING_SCREENSHOT) await page.screenshot({ path: process.env.AVA_RECORDING_SCREENSHOT });
    const preview = page.getByLabel('Recording preview');
    await preview.evaluate(audio => new Promise((resolve, reject) => {
      if (audio.readyState >= 2) return resolve();
      audio.addEventListener('loadeddata', resolve, { once: true });
      audio.addEventListener('error', reject, { once: true });
    }));
    await page.getByRole('button', { name: 'Transcribe recording', exact: true }).click();
    await page.getByRole('button', { name: 'Cancel transcription', exact: true }).waitFor();
    await page.getByRole('textbox', { name: 'Passage 1', exact: true }).waitFor({ timeout: 180000 });
    const rows = await page.evaluate(() => window.transcriber.historyList(1));
    const saved = await page.evaluate(id => window.transcriber.historyGet(id), rows[0].id);
    recordingPath = saved.sourcePath;
    assert.ok((await fs.stat(recordingPath)).size > 0);
    assert.ok(saved.segments.length > 0);
    for (const ext of ['txt', 'srt', 'vtt']) assert.ok((await fs.readFile(path.join(saved.folder, `transcript.${ext}`), 'utf8')).includes(saved.segments[0].text));
    if (real) console.log('Real Persian microphone transcript:', saved.segments.map(s => s.text).join(' '));

    // Permission and device failures keep the previous recording available for retry.
    for (const [name, message] of [['NotAllowedError', 'Microphone access was denied.'], ['NotFoundError', 'No microphone was found.'], ['NotReadableError', 'Microphone recording is unavailable.']]) {
      await page.evaluate(name => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('test', name); }; }, name);
      await record.click();
      await page.getByText(new RegExp(message.replaceAll('.', '\\.'))).waitFor();
      assert.equal(await page.getByRole('button', { name: 'Transcribe recording', exact: true }).isDisabled(), false);
    }
    await page.reload();
    await page.getByRole('button', { name: 'Start transcription', exact: true }).click();
    // Camera permission remains denied by the actual main-process permission policy.
    assert.equal(await page.evaluate(async () => {
      try { const stream = await navigator.mediaDevices.getUserMedia({ video: true }); stream.getTracks().forEach(t => t.stop()); return 'allowed'; }
      catch { return 'denied'; }
    }), 'denied');
    for (const mode of ['empty', 'error']) {
      await page.evaluate(mode => {
        window.MediaRecorder = class {
          static isTypeSupported() { return true; }
          mimeType = 'audio/webm';
          state = 'inactive';
          start() { this.state = 'recording'; if (mode === 'error') setTimeout(() => this.onerror(), 50); }
          stop() { this.state = 'inactive'; queueMicrotask(() => this.onstop()); }
        };
      }, mode);
      await record.click();
      if (mode === 'empty') await page.getByRole('button', { name: 'Stop recording', exact: true }).click();
      await page.getByText(mode === 'empty' ? 'The recording is empty. Record your voice and try again.' : 'Microphone recording failed. Please try again.', { exact: true }).waitFor();
      assert.equal(await record.isEnabled(), true);
    }
    await assert.rejects(page.evaluate(() => window.transcriber.recording(new ArrayBuffer(0), 'audio/webm')), /empty/);
    // Existing file selection still works and releases the temporary microphone file.
    const upload = path.join(root, 'uploaded.webm');
    await fs.copyFile(recordingPath, upload);
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, upload);
    await page.getByRole('button', { name: 'Choose file', exact: true }).click();
    await page.getByText('uploaded.webm', { exact: true }).waitFor();
    await assert.rejects(fs.stat(recordingPath), { code: 'ENOENT' });
    await page.getByRole('button', { name: 'Transcribe recording', exact: true }).click();
    await page.getByRole('textbox', { name: 'Passage 1', exact: true }).waitFor({ timeout: 180000 });
    assert.equal((await page.evaluate(() => window.transcriber.historyList(5))).length, 2);
    // A later recognition/decoding failure uses the same visible, recoverable error path.
    const invalid = path.join(root, 'invalid.webm');
    await fs.writeFile(invalid, 'not audio');
    await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, invalid);
    await page.getByRole('button', { name: 'Change file', exact: true }).click();
    await page.getByRole('button', { name: 'Transcribe recording', exact: true }).click();
    await page.getByText(/Process exited/).waitFor();
    assert.equal(await record.isEnabled(), true);
    // Leave an owned recording selected to verify normal app exit removes it.
    const encoded = (await fs.readFile(upload)).toString('base64');
    const final = await page.evaluate(async encoded => {
      const bytes = Uint8Array.from(atob(encoded), char => char.charCodeAt(0));
      await window.transcriber.recording(bytes.buffer, 'audio/webm');
      const result = await window.transcriber.transcribe('fa', 'cpu');
      if (result.error) throw new Error(result.error);
      return window.transcriber.historyGet(result.historyId);
    }, encoded);
    recordingPath = final.sourcePath;
    assert.ok((await fs.stat(recordingPath)).size > 0);
    assert.deepEqual(errors, []);
    console.log('Microphone desktop checks passed: real capture/permissions/playback/FFmpeg, progress, transcript, exports/history, failures, upload regression and cleanup. ' + (real ? 'Real CPU recognition with existing local Turbo model.' : 'Recognition stubbed.'));
  } finally {
    await app?.close();
    if (recordingPath) await assert.rejects(fs.stat(recordingPath), { code: 'ENOENT' });
    if (path.dirname(root) === os.tmpdir() && path.basename(root).startsWith('ava-recording-test-')) await fs.rm(root, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
