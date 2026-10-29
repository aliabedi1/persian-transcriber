const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const { createHash } = require('node:crypto');
const { Readable, Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const path = require('node:path');
const defaultCatalog = require('./model-catalog.json');

function createModelStore(userData, { catalog = defaultCatalog, fetchImpl = (...args) => fetch(...args), onChange = () => {} } = {}) {
  const directory = path.join(userData, 'models');
  const settings = path.join(directory, 'selection.json');
  const models = catalog.models.filter(m => m.engine === 'whisper.cpp-ggml-v1');
  const jobs = new Map(), filesInFlight = new Map(), validated = new Map(), validationsInFlight = new Map();
  let selectedId = null, selectionWrite = Promise.resolve();
  const fileIds = m => [...new Set([m.modelFile, m.vadFile])];
  const ids = new Set(), names = new Set();
  for (const m of models) {
    if (!/^[a-z0-9-]+$/.test(m.id) || ids.has(m.id)) throw new Error('Invalid or duplicate catalog model ID.');
    ids.add(m.id);
    for (const id of fileIds(m)) {
      const f = catalog.files[id];
      if (!f || !/^[a-zA-Z0-9_.-]+\.bin$/.test(f.name) || !Number.isSafeInteger(f.size) || f.size <= 0 || !/^[a-f0-9]{64}$/i.test(f.sha256) || !f.urls?.length || f.urls.some(url => new URL(url).protocol !== 'https:')) throw new Error(`Invalid catalog file: ${id}`);
    }
  }
  for (const f of Object.values(catalog.files)) {
    if (names.has(f.name)) throw new Error('Catalog files must have unique local names.');
    names.add(f.name);
  }
  const initialized = (async () => {
    await fs.mkdir(directory, { recursive: true });
    try { selectedId = JSON.parse(await fs.readFile(settings, 'utf8')).selectedId; } catch { /* A missing/corrupt selection requires explicit selection again. */ }
  })();
  async function valid(id) {
    const f = catalog.files[id], target = path.join(directory, f.name);
    try {
      const stat = await fs.stat(target);
      if (!stat.isFile() || stat.size !== f.size) return false;
      const stamp = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
      if (validated.get(id) === stamp) return true;
      if (validationsInFlight.get(id)?.stamp === stamp) return validationsInFlight.get(id).promise;
      const promise = (async () => {
        try {
          const hash = createHash('sha256');
          for await (const chunk of createReadStream(target)) hash.update(chunk);
          if (hash.digest('hex') !== f.sha256.toLowerCase()) return false;
          validated.set(id, stamp);
          return true;
        } catch { return false; }
      })();
      validationsInFlight.set(id, { stamp, promise });
      try { return await promise; }
      finally { if (validationsInFlight.get(id)?.promise === promise) validationsInFlight.delete(id); }
    } catch { return false; }
  }
  async function list() {
    await initialized;
    const entries = await Promise.all(models.map(async m => {
      const ready = (await Promise.all(fileIds(m).map(valid))).every(Boolean);
      const job = jobs.get(m.id);
      return { id: m.id, name: m.name, description: m.description, descriptionFa: m.descriptionFa, size: fileIds(m).reduce((sum, id) => sum + catalog.files[id].size, 0), status: job?.status === 'downloading' ? 'downloading' : ready ? 'ready' : job?.status || 'missing', percent: job?.percent || 0, error: ready ? undefined : job?.error };
    }));
    return { selectedId, models: entries };
  }
  function model(id) { const m = models.find(m => m.id === id); if (!m) throw new Error('Unknown or unsupported model.'); return m; }
  async function resolveSelected() {
    await initialized;
    const m = models.find(m => m.id === selectedId);
    if (!m || !(await Promise.all(fileIds(m).map(valid))).every(Boolean)) throw new Error('Choose and download a model in Settings → Models, then select Use model.');
    return { id: m.id, modelPath: path.join(directory, catalog.files[m.modelFile].name), vadPath: path.join(directory, catalog.files[m.vadFile].name) };
  }
  async function select(id) {
    await initialized;
    const m = model(id);
    if (!(await Promise.all(fileIds(m).map(valid))).every(Boolean)) throw new Error('Download this model first. If a download failed, retry it in Settings → Models.');
    // Serialize atomic settings writes so rapid selections cannot corrupt the file.
    const write = selectionWrite.then(async () => {
      await fs.writeFile(`${settings}.partial`, JSON.stringify({ selectedId: id }));
      await fs.rename(`${settings}.partial`, settings);
      selectedId = id;
    });
    selectionWrite = write.catch(() => {});
    await write;
    onChange();
    return list();
  }
  async function downloadFile(id, report) {
    if (await valid(id)) return report(catalog.files[id].size);
    if (filesInFlight.has(id)) { await filesInFlight.get(id); return report(catalog.files[id].size); }
    const f = catalog.files[id], target = path.join(directory, f.name), partial = `${target}.partial`;
    const job = (async () => {
      let lastError;
      for (const url of f.urls) {
        try {
          const response = await fetchImpl(url, { signal: AbortSignal.timeout(30 * 60 * 1000) });
          if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
          let received = 0;
          const hash = createHash('sha256');
          await pipeline(Readable.fromWeb(response.body), new Transform({ transform(chunk, _encoding, callback) {
            received += chunk.length;
            if (received > f.size) return callback(new Error('Download exceeds expected size.'));
            hash.update(chunk); report(received); callback(null, chunk);
          } }), createWriteStream(partial));
          if (received !== f.size || hash.digest('hex') !== f.sha256.toLowerCase()) throw new Error('Size or SHA-256 verification failed.');
          await fs.rename(partial, target);
          validated.delete(id);
          return;
        } catch (error) {
          lastError = error;
          await fs.rm(partial, { force: true });
        }
      }
      throw new Error(`${f.name}: ${lastError.message}. Check your connection and free disk space, then retry.`);
    })();
    filesInFlight.set(id, job);
    try { await job; } finally { filesInFlight.delete(id); }
  }
  async function download(id) {
    await initialized;
    const m = model(id);
    if (jobs.get(id)?.status === 'downloading') throw new Error('This model is already downloading.');
    const job = { status: 'downloading', percent: 0 };
    jobs.set(id, job);
    let completed = 0, lastNotification = 0;
    const total = fileIds(m).reduce((sum, id) => sum + catalog.files[id].size, 0);
    onChange();
    try {
      for (const fileId of fileIds(m)) {
        await downloadFile(fileId, bytes => {
          job.percent = Math.min(99, Math.floor((completed + bytes) / total * 100));
          if (Date.now() - lastNotification > 300) { lastNotification = Date.now(); onChange(); }
        });
        completed += catalog.files[fileId].size;
      }
      if (!(await Promise.all(fileIds(m).map(valid))).every(Boolean)) throw new Error('Model validation failed. Retry the download.');
      jobs.delete(id);
    } catch (error) { jobs.set(id, { status: 'error', error: error.message, percent: 0 }); }
    onChange();
    return list();
  }
  return { list, download, select, resolveSelected };
}
module.exports = { createModelStore };
