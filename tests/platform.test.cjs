const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { runtimePaths } = require('../electron/engine.cjs');
test('native tools resolve to the selected operating system bundle', () => {
  const root = path.resolve('resources');
  const windows = runtimePaths(root, 'win32');
  const linux = runtimePaths(root, 'linux');
  assert.equal(windows.cpu, path.join(root, 'runtime/whisper/Release/whisper-cli.exe'));
  assert.equal(linux.cpu, path.join(root, 'runtime/linux/cpu/whisper-cli'));
  assert.equal(linux.gpu, path.join(root, 'runtime/linux/vulkan/whisper-cli'));
  assert.equal(linux.ffmpeg, path.join(root, 'runtime/linux/ffmpeg/ffmpeg'));
});
