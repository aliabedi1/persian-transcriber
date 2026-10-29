const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRecordingStore } = require('../electron/recordings.cjs');

test('rejects empty, invalid, and oversized data without discarding the current recording', () => {
  const store = createRecordingStore();
  try {
    const saved = store.save(new Uint8Array([1, 2, 3]).buffer, 'audio/webm;codecs=opus');
    assert.throws(() => store.save(new ArrayBuffer(0), 'audio/webm'), /empty/);
    assert.throws(() => store.save('data', 'audio/webm'), /empty/);
    assert.throws(() => store.save(new ArrayBuffer(1), '../../wav'), /Unsupported/);
    assert.throws(() => store.save(new ArrayBuffer(256 * 1024 * 1024 + 1), 'audio/webm'), /too large/);
    assert.deepEqual(fs.readFileSync(saved.path), Buffer.from([1, 2, 3]));
  } finally { store.clear(); }
});

test('replaces owned recordings and removes the temporary directory on cleanup', () => {
  const store = createRecordingStore();
  let directory;
  try {
    const first = store.save(new ArrayBuffer(10), 'audio/webm');
    directory = path.dirname(first.path);
    const second = store.save(new ArrayBuffer(20), 'audio/ogg;codecs=opus');
    assert.equal(fs.existsSync(first.path), false);
    assert.equal(fs.statSync(second.path).size, 20);
    assert.equal(second.size, 20);
    assert.match(second.name, /\.ogg$/);
  } finally { store.clear(); store.clear(); }
  assert.equal(fs.existsSync(directory), false);
});
