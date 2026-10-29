const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { createModelStore } = require('../electron/models.cjs');

function fixture() {
  const data = { a: 'first model', b: 'second model', vad: 'speech detector' };
  const files = Object.fromEntries(Object.entries(data).map(([id, body]) => [id, { name: `${id}.bin`, urls: [`https://models.example/${id}`], size: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') }]));
  return { data, catalog: { files, models: ['a', 'b'].map(id => ({ id, name: id, description: id, engine: 'whisper.cpp-ggml-v1', modelFile: id, vadFile: 'vad' })) } };
}
async function temporary(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ava-model-unit-'));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return dir;
}
test('fresh startup never fetches; explicit downloads, switching and restart work offline', async t => {
  const dir = await temporary(t), { data, catalog } = fixture(), requested = [];
  const store = createModelStore(dir, { catalog, fetchImpl: async url => { requested.push(url); return new Response(data[url.split('/').pop()]); } });
  assert.equal((await store.list()).models.every(m => m.status === 'missing'), true);
  await assert.rejects(store.resolveSelected(), /Settings/);
  await assert.rejects(store.select('a'), /Download/);
  assert.equal(requested.length, 0);
  await Promise.all([store.download('a'), store.download('b')]);
  assert.equal(requested.filter(url => url.endsWith('/vad')).length, 1);
  assert.equal((await store.list()).selectedId, null);
  await store.select('a');
  const activeJobModel = await store.resolveSelected();
  await store.select('b');
  assert.equal(path.basename(activeJobModel.modelPath), 'a.bin');
  assert.equal((await store.resolveSelected()).id, 'b');
  const offline = createModelStore(dir, { catalog, fetchImpl: () => { throw new Error('offline'); } });
  assert.equal((await offline.resolveSelected()).id, 'b');
  assert.equal((await offline.list()).models.every(m => m.status === 'ready'), true);
});
test('size, checksum, HTTP errors and interrupted downloads remain unusable and retryable', async t => {
  const dir = await temporary(t), { data, catalog } = fixture();
  let mode = 'http';
  const store = createModelStore(dir, { catalog, fetchImpl: async url => {
    if (mode === 'http') return new Response('unavailable', { status: 503 });
    if (mode === 'short') return new Response('a');
    if (mode === 'hash') return new Response('x'.repeat(data[url.split('/').pop()].length));
    if (mode === 'interrupted') return new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array([1])); c.error(new Error('connection lost')); } }));
    return new Response(data[url.split('/').pop()]);
  } });
  for (mode of ['http', 'short', 'hash', 'interrupted']) {
    const result = await store.download('a');
    assert.equal(result.models[0].status, 'error');
    assert.match(result.models[0].error, /retry/);
    await assert.rejects(store.select('a'));
    assert.equal((await fs.readdir(path.join(dir, 'models'))).some(name => name.endsWith('.partial')), false);
  }
  // A crash can leave a partial file. Startup ignores it and retry replaces it.
  await fs.writeFile(path.join(dir, 'models/a.bin.partial'), 'interrupted');
  const restart = createModelStore(dir, { catalog });
  assert.equal((await restart.list()).models[0].status, 'missing');
  mode = 'ok';
  await store.download('a');
  await store.select('a');
  // Even a same-size corruption must not be accepted after restarting.
  await fs.writeFile(path.join(dir, 'models/a.bin'), 'x'.repeat(data.a.length));
  await assert.rejects(createModelStore(dir, { catalog }).resolveSelected());
  assert.equal((await store.download('a')).models[0].status, 'ready');
  await fs.rm(path.join(dir, 'models/vad.bin'));
  await assert.rejects(store.resolveSelected());
});
test('catalog additions and mirrors need no UI logic; unsupported engines stay hidden', async t => {
  const dir = await temporary(t), { data, catalog } = fixture(), urls = [];
  catalog.models.push({ ...catalog.models[0], id: 'developer-added', name: 'Added model' }, { ...catalog.models[0], id: 'unsupported', engine: 'another-engine' });
  catalog.files.a.urls = ['https://broken.example/a', 'https://configured-source.example/a'];
  const store = createModelStore(dir, { catalog, fetchImpl: async url => { urls.push(url); return url.includes('broken') ? new Response('', { status: 404 }) : new Response(data[url.split('/').pop()]); } });
  assert.equal((await store.list()).models.length, 3);
  assert.equal((await store.download('developer-added')).models[2].status, 'ready');
  assert.ok(urls.includes('https://configured-source.example/a'));
  await assert.rejects(store.download('unsupported'));
});
test('packaging and setup exclude automatic model downloads', async () => {
  const pkg = require('../package.json');
  for (const platform of ['win', 'linux']) assert.equal(pkg.build[platform].extraResources.some(r => r.from === 'models'), false);
  for (const script of ['setup.ps1', 'scripts/setup-linux.sh']) assert.doesNotMatch(await fs.readFile(path.join(__dirname, '..', script), 'utf8'), /huggingface|ggml-.*\.bin/);
});
