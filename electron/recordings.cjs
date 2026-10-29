const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// Only files created here are ever removed; uploaded media is never owned by this store.
function createRecordingStore() {
  let directory, current, sequence = 0;
  return {
    save(bytes, mimeType) {
      const type = typeof mimeType === 'string' ? mimeType.split(';')[0] : '';
      const extension = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a' }[type];
      if (!extension) throw new Error('Unsupported recording format.');
      if (!(bytes instanceof ArrayBuffer) || bytes.byteLength === 0) throw new Error('The recording is empty.');
      if (bytes.byteLength > 256 * 1024 * 1024) throw new Error('Recording is too large. Try a shorter recording.');
      directory ||= fs.mkdtempSync(path.join(os.tmpdir(), 'ava-recording-'));
      const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
      const target = path.join(directory, `Microphone-${stamp}-${++sequence}.${extension}`);
      try { fs.writeFileSync(target, Buffer.from(bytes), { flag: 'wx', mode: 0o600 }); }
      catch (error) { fs.rmSync(target, { force: true }); throw error; }
      const previous = current;
      current = target;
      if (previous) fs.rmSync(previous, { force: true });
      return { path: target, name: path.basename(target), size: bytes.byteLength };
    },
    clear() {
      if (directory) fs.rmSync(directory, { recursive: true, force: true });
      directory = undefined; current = undefined;
    },
  };
}
module.exports = { createRecordingStore };
