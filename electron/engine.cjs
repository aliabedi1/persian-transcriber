const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');

function run(exe, args, { signal, onData = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true, signal, shell: false });
    let tail = '', processError;
    for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
      const text = chunk.toString('utf8'); tail = (tail + text).slice(-8000); onData(text);
    });
    child.on('error', error => { processError = error; });
    child.on('close', code => processError ? reject(processError) : code === 0 ? resolve(tail) : reject(new Error(`Process exited (${code}). ${tail}`)));
  });
}
function normalize(text) {
  return text.replace(/ي/g, 'ی').replace(/ك/g, 'ک').trim();
}
function timestamp(ms, separator) {
  const n = Math.max(0, Math.round(ms));
  return `${String(Math.floor(n / 3600000)).padStart(2, '0')}:${String(Math.floor(n / 60000) % 60).padStart(2, '0')}:${String(Math.floor(n / 1000) % 60).padStart(2, '0')}${separator}${String(n % 1000).padStart(3, '0')}`;
}
function subtitles(segments, format) {
  return (format === 'vtt' ? 'WEBVTT\n\n' : '') + segments.map((s, i) =>
    `${format === 'srt' ? `${i + 1}\n` : ''}${timestamp(s.start, format === 'srt' ? ',' : '.')} --> ${timestamp(s.end, format === 'srt' ? ',' : '.')}\n${s.text.trim()}\n`
  ).join('\n');
}
async function transcribe({ input, language = 'fa', root, signal, onProgress = () => {}, executable }) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ava-transcribe-'));
  try {
    const audio = path.join(temp, 'audio.wav');
    onProgress({ stage: 'Preparing audio', percent: 0 });
    // Restrict input protocols so a media file cannot fetch remote resources.
    await run(path.join(root, 'runtime/ffmpeg/ffmpeg.exe'), ['-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', input, '-vn', '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', '-y', audio], { signal });
    onProgress({ stage: 'Transcribing locally', percent: 0 });
    const output = path.join(temp, 'transcript');
    await run(executable || path.join(root, 'runtime/whisper/Release/whisper-cli.exe'), [
      '-m', path.join(root, 'models/ggml-large-v3-turbo-q5_0.bin'), '-f', audio,
      '-l', language, '-t', String(Math.min(8, os.availableParallelism())),
      '-oj', '-of', output, '-pp', '-sns', '-ng',
    ], { signal, onData: text => {
      for (const match of text.matchAll(/progress\s*=\s*(\d+)%/g)) onProgress({ stage: 'Transcribing locally', percent: Number(match[1]) });
    } });
    const data = JSON.parse(await fs.readFile(`${output}.json`, 'utf8'));
    const segments = data.transcription.map(s => ({ start: s.offsets.from, end: s.offsets.to, text: language === 'fa' ? normalize(s.text) : s.text.trim() }));
    return { segments, text: segments.map(s => s.text).join('\n') };
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
module.exports = { transcribe, run, normalize, timestamp, subtitles };
