// Explicit real-inference regression. Uses only development models and a public fixture.
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const { createLiveEngine } = require('../electron/live-engine.cjs');
const { runtimePaths } = require('../electron/engine.cjs');

(async () => {
  const root = path.resolve(__dirname, '..');
  const device = process.argv[2] || 'cpu';
  const { stdout: pcm } = await promisify(execFile)(runtimePaths(root).ffmpeg,
    ['-nostdin', '-v', 'error', '-i', path.join(root, 'tests/fixtures/persian-fleurs.wav'), '-ar', '16000', '-ac', '1', '-f', 's16le', 'pipe:1'],
    { encoding: 'buffer', maxBuffer: 1024 * 1024, windowsHide: true });
  const engine = await createLiveEngine({ root, modelPath: path.join(root, 'models/ggml-large-v3-turbo-q5_0.bin'),
    vadPath: path.join(root, 'models/ggml-silero-v5.1.2.bin'), language: 'fa', device });
  try {
    assert.deepEqual(await engine.transcribe(Buffer.alloc(256000)), []);
    const start = performance.now();
    const segments = await engine.transcribe(pcm.subarray(0, 256000));
    const inferenceMs = Math.round(performance.now() - start);
    assert.match(segments.map(s => s.text).join(' '), /[\u0600-\u06ff]/);
    assert.ok(segments.every(s => s.start >= 0 && s.end >= s.start));
    assert.deepEqual(await engine.transcribe(Buffer.alloc(256000)), []);
    console.log(`${device}: 8 seconds of public Persian speech transcribed in ${inferenceMs} ms (${segments.length} passages); silence before/after stays empty and engine remains usable.`);
  } finally { await engine.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
