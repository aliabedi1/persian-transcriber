const { test } = require('node:test');
const assert = require('node:assert/strict');
const { wav, createLiveSession } = require('../electron/live-engine.cjs');
const pcm = ms => new ArrayBuffer(ms * 32);
const tick = () => new Promise(resolve => setImmediate(resolve));

test('PCM WAV header describes 16 kHz mono and correct payload length', () => {
  const file = wav(Buffer.alloc(32000));
  assert.equal(file.readUInt32LE(24), 16000);
  assert.equal(file.readUInt32LE(40), 32000);
  assert.equal(file.length, 32044);
});

test('live updates arrive before stop; final short tail drains and timestamps stay global', async () => {
  const updates = [], sizes = [];
  const session = createLiveSession({ windowMs: 500, overlapMs: 100,
    engine: { close: async () => {}, transcribe: async audio => { sizes.push(audio.length); return [{ start: 0, end: audio.length / 32, text: `سلام ${sizes.length}` }]; } },
    onUpdate: update => updates.push(update),
  });
  session.push(pcm(500)); await tick();
  assert.equal(updates.length, 1);
  session.push(pcm(200));
  const result = await session.stop();
  assert.deepEqual(sizes, [16000, 9600]);
  assert.equal(result.segments.at(-1).end, 700);
});

test('overlap removes repeated boundary words but preserves repetition outside overlap', async () => {
  let call = 0;
  const responses = [
    [{ start: 0, end: 500, text: 'سلام دنیا' }],
    [{ start: 0, end: 500, text: 'دنیا خوبی' }],
    [{ start: 100, end: 500, text: 'خوبی' }],
  ];
  const session = createLiveSession({ windowMs: 500, overlapMs: 100,
    engine: { close: async () => {}, transcribe: async () => responses[call++] },
  });
  session.push(pcm(500)); await tick();
  session.push(pcm(400)); await tick();
  session.push(pcm(400)); await tick();
  const result = await session.stop();
  assert.deepEqual(result.segments.map(s => s.text), ['سلام دنیا', 'خوبی', 'خوبی']);
  assert.equal(call, 3, 'overlap-only tail is not decoded twice');
});

test('bounded backlog rejects excess input and stop preserves accepted audio', async () => {
  let complete;
  const session = createLiveSession({ windowMs: 500, overlapMs: 100, maxBufferedMs: 1000,
    engine: { close: async () => {}, transcribe: () => new Promise(resolve => { complete = resolve; }) },
  });
  session.push(pcm(500));
  assert.throws(() => session.push(pcm(600)), /cannot keep up/);
  complete([{ start: 0, end: 500, text: 'accepted audio' }]);
  const result = await session.stop();
  assert.equal(result.segments[0].text, 'accepted audio');
});

test('engine failure keeps previously completed passages available to save', async () => {
  let count = 0, message;
  const session = createLiveSession({ windowMs: 500, overlapMs: 100,
    engine: { close: async () => {}, transcribe: async () => { if (++count === 2) throw new Error('Device failed'); return [{ start: 0, end: 500, text: 'preserved' }]; } },
    onError: error => { message = error; },
  });
  session.push(pcm(500)); await tick(); session.push(pcm(400)); await tick();
  const result = await session.stop();
  assert.equal(message, 'Device failed'); assert.equal(result.error, 'Device failed');
  assert.equal(result.segments[0].text, 'preserved');
});
