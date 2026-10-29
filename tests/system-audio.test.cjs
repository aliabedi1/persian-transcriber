const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { systemAudioCapability, startSystemAudio } = require('../electron/system-audio.cjs');

test('Linux capability selects the default output monitor and rejects missing prerequisites', async () => {
  const exec = async (_file, args) => ({ stdout: args.includes('-devices') ? ' D  pulse PulseAudio audio input' : args[0] === 'get-default-sink' ? 'speakers\n' : '1\tspeakers.monitor\tmodule-null-sink.c\ts16le\n' });
  assert.equal((await systemAudioCapability('/app', 'linux', exec)).monitor, 'speakers.monitor');
  const denied = await systemAudioCapability('/app', 'linux', async () => { throw new Error('No server'); });
  assert.equal(denied.system, false); assert.match(denied.reason, /pulseaudio-utils/);
  assert.equal((await systemAudioCapability('/app', 'win32')).system, true);
});

test('Linux pipe capture emits aligned PCM packets and releases the process on stop', async () => {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  let killed = false, argumentsUsed;
  child.kill = () => { killed = true; setImmediate(() => child.emit('close', 0)); };
  const packets = [];
  const starting = startSystemAudio({ root: '/app', monitor: 'speakers.monitor', onAudio: bytes => packets.push(bytes), onError: assert.fail,
    spawnProcess: (_file, args) => { argumentsUsed = args; return child; },
  });
  child.stdout.write(Buffer.alloc(3501));
  const capture = await starting;
  assert.equal(packets[0].byteLength, 3200);
  assert.ok(argumentsUsed.includes('speakers.monitor'));
  await capture.stop();
  assert.equal(killed, true); assert.equal(packets[1].byteLength, 300);
});

test('Linux capture startup failure rejects with a recoverable device error', async () => {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.kill = () => {};
  const starting = startSystemAudio({ root: '/app', monitor: 'missing', onAudio: assert.fail, onError: assert.fail, spawnProcess: () => child });
  child.stderr.write('No such source'); child.emit('close', 1);
  await assert.rejects(starting, /Check the output device.*No such source/);
});
