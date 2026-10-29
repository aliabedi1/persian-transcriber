const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function worklet() {
  let Processor;
  const messages = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/pcm-capture.js'), 'utf8'), {
    AudioWorkletProcessor: class { constructor() { this.port = { postMessage: data => messages.push(data) }; } },
    sampleRate: 48000, ArrayBuffer, Int16Array,
    registerProcessor: (_name, ctor) => { Processor = ctor; },
  });
  return { node: new Processor(), messages };
}

test('worklet downmixes stereo, resamples 48 kHz to 16 kHz and flushes the final packet', () => {
  const { node, messages } = worklet();
  for (let i = 0; i < 375; i++) node.process([[new Float32Array(128).fill(0.6), new Float32Array(128).fill(0.2)]], []);
  assert.equal(messages.length, 10);
  assert.equal(messages.reduce((sum, data) => sum + data.byteLength, 0), 32000);
  assert.ok(Math.abs(new Int16Array(messages[0])[0] - 13107) < 2);
  node.process([[new Float32Array(128)]], []);
  node.port.onmessage({ data: 'flush' });
  assert.equal(messages.at(-1), 'flushed'); assert.equal(messages.at(-2).byteLength, 84);
});

test('native system audio mixes with microphone once, pause discards paused samples', () => {
  const { node, messages } = worklet();
  node.port.onmessage({ data: { mode: 'both' } });
  node.port.onmessage({ data: new Int16Array(1600).fill(8192).buffer });
  for (let i = 0; i < 38; i++) node.process([[new Float32Array(128).fill(0.25)]], []);
  assert.ok(Math.abs(new Int16Array(messages[0])[0] - 8192) < 2);
  node.port.onmessage({ data: 'pause' });
  const pausedCount = messages.length;
  node.port.onmessage({ data: new Int16Array(1600).fill(16000).buffer });
  for (let i = 0; i < 38; i++) node.process([[new Float32Array(128)]], []);
  assert.equal(messages.length, pausedCount);
  node.port.onmessage({ data: 'resume' });
  for (let i = 0; i < 38; i++) node.process([[new Float32Array(128)]], []);
  assert.equal(new Int16Array(messages.at(-1)).some(value => value !== 0), false);
});
