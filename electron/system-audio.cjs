const { spawn, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const { runtimePaths } = require('./engine.cjs');
const execute = promisify(execFile);

async function systemAudioCapability(root, platform = process.platform, exec = execute) {
  if (platform === 'win32') return { platform, system: true };
  if (platform !== 'linux') return { platform, system: false, reason: 'System audio is supported on Windows and Linux.' };
  try {
    const paths = runtimePaths(root, 'linux');
    const options = { timeout: 5000, windowsHide: true, env: { ...process.env, LD_LIBRARY_PATH: path.dirname(paths.ffmpeg) } };
    const [{ stdout: devices, stderr = '' }, { stdout: sink }, { stdout: sources }] = await Promise.all([
      exec(paths.ffmpeg, ['-hide_banner', '-devices'], options),
      exec('pactl', ['get-default-sink'], options),
      exec('pactl', ['list', 'short', 'sources'], options),
    ]);
    if (!/\bD\s+pulse\b/.test(devices + stderr)) throw new Error('FFmpeg has no PulseAudio input support.');
    const monitor = `${sink.trim()}.monitor`;
    if (!sources.split('\n').some(line => line.split('\t')[1] === monitor)) throw new Error('The default audio output has no monitor source.');
    return { platform, system: true, monitor };
  } catch (error) {
    return { platform, system: false, reason: `Linux system audio needs a running PulseAudio or PipeWire-Pulse server, pactl (pulseaudio-utils), and FFmpeg with PulseAudio input. ${error.message}` };
  }
}

async function startSystemAudio({ root, monitor, onAudio, onError, signal, spawnProcess = spawn }) {
  signal?.throwIfAborted();
  const executable = runtimePaths(root, 'linux').ffmpeg;
  const child = spawnProcess(executable, ['-nostdin', '-hide_banner', '-v', 'error', '-f', 'pulse', '-fragment_size', '3200',
    '-i', monitor, '-vn', '-ar', '16000', '-ac', '1', '-f', 's16le', 'pipe:1'],
  { windowsHide: true, shell: false, env: { ...process.env, LD_LIBRARY_PATH: path.dirname(executable) } });
  let stopped = false, ready = false, tail = '', pending = Buffer.alloc(0), rejectReady, resolveReady;
  const started = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const closed = new Promise(resolve => child.once('close', code => {
    if (!stopped) {
      const error = new Error(`System audio capture stopped (${code}). Check the output device. ${tail}`);
      if (!ready) rejectReady(error); else onError(error.message);
    }
    resolve();
  }));
  child.on('error', error => { if (!ready) rejectReady(error); else if (!stopped) onError(error.message); });
  child.stderr.on('data', bytes => { tail = (tail + bytes.toString()).slice(-1000); });
  child.stdout.on('data', bytes => {
    if (stopped) return;
    if (!ready) { ready = true; resolveReady(); }
    pending = Buffer.concat([pending, bytes]);
    while (pending.length >= 3200) {
      const packet = pending.subarray(0, 3200);
      onAudio(Uint8Array.from(packet).buffer);
      pending = pending.subarray(3200);
    }
  });
  const stop = async () => {
    if (!stopped) {
      stopped = true;
      if (pending.length >= 2) onAudio(Uint8Array.from(pending.subarray(0, pending.length & ~1)).buffer);
      child.kill(); rejectReady(new Error('System audio capture stopped.'));
    }
    await closed;
    signal?.removeEventListener('abort', abort);
  };
  const abort = () => { void stop(); };
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const timeout = setTimeout(() => rejectReady(new Error('System audio capture timed out. Check the PulseAudio/PipeWire server.')), 10000);
  try { await started; return { stop }; }
  catch (error) { await stop(); throw error; }
  finally { clearTimeout(timeout); }
}
module.exports = { systemAudioCapability, startSystemAudio };
