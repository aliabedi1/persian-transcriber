const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalize, timestamp, subtitles, run } = require('../electron/engine.cjs');
test('Persian normalization preserves half-spaces and digits', () => assert.equal(normalize('  كي مي‌روم ۱۲۳  '), 'کی می‌روم ۱۲۳'));
test('subtitles support hours, fractional rounding and Persian Unicode', () => {
  assert.equal(timestamp(3599999.6, ','), '01:00:00,000');
  const segments = [{ start: 1000, end: 2500, text: 'سلام دنیا' }];
  assert.equal(subtitles(segments, 'srt'), '1\n00:00:01,000 --> 00:00:02,500\nسلام دنیا\n');
  assert.match(subtitles(segments, 'vtt'), /^WEBVTT\n\n00:00:01\.000/);
});
test('process errors and cancellation reach the caller', async () => {
  await assert.rejects(run(process.execPath, ['-e', 'process.exit(2)']), /Process exited \(2\)/);
  const controller = new AbortController();
  const job = run(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { signal: controller.signal });
  controller.abort();
  await assert.rejects(job, /abort/i);
});
