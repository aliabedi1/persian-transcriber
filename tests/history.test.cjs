const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHistoryStore, safeName, defaultSaveFolder } = require('../electron/history.cjs');

test('history persists, exports Unicode, updates edits and keeps same-name jobs distinct', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ava-history-test-'));
  const database = path.join(root, 'app-data');
  const defaults = path.join(root, 'Documents', 'Ava');
  let store = createHistoryStore(database, defaults);
  const input = { sourcePath: path.join(root, 'درس.mp3'), language: 'fa', quality: 'fast', device: 'cpu', segments: [{ start: 0, end: 1500, text: 'سلام دنیا' }] };
  const first = await store.add(input);
  const second = await store.add(input);
  assert.equal(first.folder, path.join(defaults, 'درس'));
  assert.equal(second.folder, path.join(defaults, 'درس (2)'));
  assert.equal(first.saveError, null);
  for (const format of ['txt', 'srt', 'vtt']) assert.match(await fs.readFile(path.join(first.folder, `transcript.${format}`), 'utf8'), /سلام دنیا/);
  const metadata = JSON.parse(await fs.readFile(path.join(first.folder, 'transcript.json'), 'utf8'));
  assert.deepEqual(metadata.segments, input.segments);
  await store.update(first.id, [{ start: 0, end: 1500, text: 'متن ویرایش‌شده' }]);
  assert.match(await fs.readFile(path.join(first.folder, 'transcript.srt'), 'utf8'), /متن ویرایش‌شده/);
  assert.equal(store.get(first.id).folder, first.folder);
  const custom = path.join(root, 'custom-folder');
  store.setFolder(custom);
  for (let i = 0; i < 5; i++) await store.add(input);
  const recent = store.list(5);
  assert.equal(recent.length, 5);
  assert.equal(store.list(50).length, 7);
  assert.equal(store.list(50, 5).length, 2);
  store.close();
  store = createHistoryStore(database, defaults);
  assert.equal(store.folder(), custom);
  assert.equal(store.get(first.id).segments[0].text, 'متن ویرایش‌شده');
  assert.equal(store.list(50).length, 7);
  assert.ok(store.list(5).every((r, i, a) => !i || r.createdAt <= a[i - 1].createdAt));
  store.close();
});

test('an unwritable save destination retains history and can retry in a new folder', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ava-history-failure-'));
  const blocked = path.join(root, 'not-a-directory');
  await fs.writeFile(blocked, 'file');
  const store = createHistoryStore(path.join(root, 'data'), blocked);
  const record = await store.add({ sourcePath: path.join(root, 'removed.mp3'), language: 'fa', quality: 'fast', device: 'cpu', segments: [{ start: 0, end: 1000, text: 'محفوظ' }] });
  assert.ok(record.saveError);
  assert.equal(store.get(record.id).text, 'محفوظ');
  store.setFolder(path.join(root, 'usable'));
  const recovered = await store.retry(record.id);
  assert.equal(recovered.saveError, null);
  assert.match(await fs.readFile(path.join(recovered.folder, 'transcript.txt'), 'utf8'), /محفوظ/);
  store.close();
  assert.equal(safeName('CON.mp3'), 'transcript');
  assert.equal(safeName('a:b?.mp3'), 'a_b_');
});

test('default save folders use OS locations on Windows and Linux with fallback', () => {
 assert.equal(defaultSaveFolder(() => 'D:\\Users\\Demo\\Documents', path.win32), 'D:\\Users\\Demo\\Documents\\Ava');
 assert.equal(defaultSaveFolder(() => '/home/demo/Documents', path.posix), '/home/demo/Documents/Ava');
 assert.equal(defaultSaveFolder(key => { if(key === 'documents') throw new Error('missing'); return '/home/demo/Downloads'; }, path.posix), '/home/demo/Downloads/Ava');
});


test('folder allocation skips existing files and folders and handles concurrent same-name exports', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ava-folder-names-'));
  const output = path.join(root, 'exports');
  await fs.mkdir(path.join(output, 'voice'), { recursive: true });
  await fs.writeFile(path.join(output, 'voice (2)'), 'keep');
  const store = createHistoryStore(path.join(root, 'data'), output);
  try {
    const input = { sourcePath: path.join(root, 'voice.wav'), language: 'en', quality: 'fast', device: 'cpu', segments: [] };
    const records = await Promise.all([store.add(input), store.add(input)]);
    assert.deepEqual(records.map(r => path.basename(r.folder)).sort(), ['voice (3)', 'voice (4)']);
    assert.ok(records.every(r => r.saveError === null));
    assert.equal(await fs.readFile(path.join(output, 'voice (2)'), 'utf8'), 'keep');
  } finally { store.close(); }
});
