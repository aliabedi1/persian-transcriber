const { spawn } = require('node:child_process');
const { createServer } = require('node:net');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs/promises');
const { runtimePaths, normalize, run } = require('./engine.cjs');

function wav(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

// Only the main process knows the random request prefix. No renderer networking is enabled.
async function createLiveEngine({ root, modelPath, vadPath, language, device, signal }) {
  const cli = runtimePaths(root)[device === 'gpu' ? 'gpu' : 'cpu'];
  const executable = path.join(path.dirname(cli), process.platform === 'win32' ? 'whisper-server.exe' : 'whisper-server');
  const vadExecutable = path.join(path.dirname(runtimePaths(root).cpu), process.platform === 'win32' ? 'whisper-vad-speech-segments.exe' : 'whisper-vad-speech-segments');
  try { await Promise.all([fs.access(executable), fs.access(vadExecutable)]); }
  catch { throw new Error('Live transcription tools are missing. Run setup.ps1 (Windows) or scripts/setup-linux.sh (Linux), then restart Ava.'); }
  const port = await freePort();
  const prefix = `/${randomUUID()}`;
  const url = `http://127.0.0.1:${port}${prefix}`;
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ava-live-'));
  let tail = '', failure, gpuUsed = false;
  const child = spawn(executable, ['-m', modelPath, '-l', language, '-t', String(Math.min(8, os.availableParallelism())),
    '--host', '127.0.0.1', '--port', String(port), '--request-path', prefix,
    '-sns', ...(device === 'cpu' ? ['-ng'] : [])],
  { windowsHide: true, shell: false, env: { ...process.env, LD_LIBRARY_PATH: [path.dirname(executable), process.env.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter) } });
  child.on('error', error => { failure = error; });
  const closed = new Promise(resolve => child.once('close', code => { failure ||= new Error(`Live engine exited (${code}). ${tail}`); resolve(); }));
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => {
    const text = data.toString(); tail = (tail + text).slice(-4000);
    if (/using Vulkan\d+ backend/.test(text)) gpuUsed = true;
  });
  let closePromise;
  const close = () => closePromise ||= (async () => { if (child.exitCode === null) child.kill(); await closed; signal?.removeEventListener('abort', abort); await fs.rm(temp, { recursive: true, force: true }); })();
  const abort = () => { void close(); };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const deadline = Date.now() + 120000;
    while (true) {
      signal?.throwIfAborted();
      if (failure) throw failure;
      if (Date.now() > deadline) throw new Error('Live engine startup timed out. Try CPU or another model.');
      try {
        const response = await fetch(`${url}/`, { signal: AbortSignal.timeout(500) });
        await response.body?.cancel();
        // The HTTP listener starts only after model loading. A 404 is also ready.
        break;
      } catch { await new Promise(resolve => setTimeout(resolve, 150)); }
    }
    if (device === 'gpu' && !gpuUsed) throw new Error('The live engine did not activate a GPU. Choose CPU or Auto.');
  } catch (error) { await close(); throw error; }
  return {
    close,
    async transcribe(pcm) {
      signal?.throwIfAborted();
      if (failure) throw failure;
      // The bundled server's VAD path crashes on zero detected speech. Run the small
      // CPU detector separately, keeping the expensive Whisper model resident.
      const file = path.join(temp, 'capture.wav');
      await fs.writeFile(file, wav(pcm));
      const vad = await run(vadExecutable, ['-vm', vadPath, '-f', file, '-vp', '200', '-np'], { signal });
      if (!/Speech segment \d+:/.test(vad)) return [];
      const form = new FormData();
      form.set('file', new Blob([wav(pcm)], { type: 'audio/wav' }), 'capture.wav');
      form.set('response_format', 'verbose_json'); form.set('language', language);
      form.set('temperature', '0'); form.set('temperature_inc', '0');
      let response;
      try {
        response = await fetch(`${url}/inference`, { method: 'POST', body: form,
          signal: AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(120000)]) });
      } catch (error) { throw new Error(`Live engine request failed: ${error.message}. ${tail}`); }
      if (!response.ok) throw new Error(`Live transcription failed (${response.status}).`);
      const data = await response.json();
      if (!Array.isArray(data.segments)) throw new Error('The live engine returned an invalid transcript.');
      return data.segments.map(s => ({ start: Math.round(s.start * 1000), end: Math.round(s.end * 1000),
        text: language === 'fa' ? normalize(s.text) : s.text.trim() }))
        .filter(s => s.text && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end >= s.start);
    },
  };
}

// Bounded PCM queue. Overlapping windows retain context across phrase boundaries.
function createLiveSession({ engine, onUpdate = () => {}, onError = () => {}, windowMs = 8000, overlapMs = 1000, maxBufferedMs = 120000 }) {
  const bytesPerMs = 32;
  let pending = Buffer.alloc(0), offset = 0, processedEnd = 0, active = true, stopping = false, job, failure;
  const segments = [];
  const snapshot = () => ({ segments: segments.map(s => ({ ...s })), bufferedMs: Math.max(0, pending.length / bytesPerMs - overlapMs) });
  function merge(incoming, start) {
    const cutoff = processedEnd;
    const fresh = incoming.map(s => ({ ...s, start: Math.max(0, s.start + start), end: Math.max(0, s.end + start) }));
    for (const segment of fresh) {
      if (segment.end <= cutoff || !segment.text) continue;
      // Only deduplicate text at an actual audio overlap; repeated later phrases survive.
      if (segment.start < cutoff && segments.length) {
        const previous = segments.at(-1).text.split(/\s+/);
        const words = segment.text.split(/\s+/);
        const key = word => word.replace(/[\p{P}\p{S}]/gu, '').toLowerCase();
        for (let n = Math.min(previous.length, words.length, 30); n > 0; n--) {
          if (previous.slice(-n).map(key).join(' ') === words.slice(0, n).map(key).join(' ')) {
            segment.text = words.slice(n).join(' '); break;
          }
        }
      }
      if (segment.text) segments.push({ ...segment, start: Math.max(cutoff, segment.start) });
    }
  }
  async function drain() {
    try {
      while (active && (pending.length >= windowMs * bytesPerMs || (stopping && pending.length > 0))) {
        // Do not transcribe an overlap-only tail a second time.
        if (stopping && offset + pending.length / bytesPerMs <= processedEnd) break;
        const length = Math.min(pending.length, windowMs * bytesPerMs);
        const audio = Buffer.from(pending.subarray(0, length));
        const start = offset;
        const incoming = await engine.transcribe(audio);
        merge(incoming, start);
        processedEnd = start + length / bytesPerMs;
        const consumed = length === pending.length && stopping ? length : length - overlapMs * bytesPerMs;
        pending = pending.subarray(consumed); offset += consumed / bytesPerMs;
        onUpdate(snapshot());
      }
    } catch (error) { failure = error; active = false; onError(error.message); }
  }
  function schedule() {
    if (!job) job = drain().finally(() => { job = null; });
    return job;
  }
  return {
    push(bytes) {
      if (!active || stopping) throw new Error('Live capture is no longer accepting audio.');
      if (!(bytes instanceof ArrayBuffer) || !bytes.byteLength || bytes.byteLength % 2 || bytes.byteLength > 32000) throw new Error('Invalid live audio packet.');
      if (pending.length + bytes.byteLength > maxBufferedMs * bytesPerMs) throw new Error('Transcription cannot keep up. Stop and save this session, then try a faster model or GPU.');
      pending = Buffer.concat([pending, Buffer.from(bytes)]);
      void schedule();
    },
    snapshot,
    async stop() {
      stopping = true;
      await job;
      if (active) await schedule();
      active = false;
      await engine.close();
      return { ...snapshot(), error: failure?.message };
    },
    async abort() { active = false; await engine.close(); await job; },
  };
}
module.exports = { wav, createLiveEngine, createLiveSession };
