const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs/promises');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { subtitles } = require('./engine.cjs');

function defaultSaveFolder(getPath, pathApi = path) {
  for (const key of ['documents', 'downloads', 'home']) {
    try { const base = getPath(key); if (base && pathApi.isAbsolute(base)) return pathApi.join(base, 'Ava'); } catch {}
  }
  throw new Error('No writable user folder location was found.');
}
function safeName(name) {
  const extension = path.extname(name);
  const stem = extension ? name.slice(0, -extension.length) : name;
  // Control characters are intentionally removed from filesystem names.
  // eslint-disable-next-line no-control-regex
  const value = stem.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 80);
  return !value || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(value) ? 'transcript' : value;
}
function localDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function createHistoryStore(directory, defaultFolder) {
  mkdirSync(directory, { recursive: true });
  const db = new DatabaseSync(path.join(directory, 'history.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS transcriptions (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, source_name TEXT NOT NULL,
      source_path TEXT NOT NULL, language TEXT NOT NULL, quality TEXT NOT NULL,
      device TEXT NOT NULL, text TEXT NOT NULL, segments TEXT NOT NULL,
      segment_count INTEGER NOT NULL, folder TEXT, save_error TEXT);
    CREATE INDEX IF NOT EXISTS transcriptions_date ON transcriptions(created_at DESC, id DESC);`);
  const folder = () => { const saved = db.prepare('SELECT value FROM settings WHERE key=?').get('saveFolder')?.value; return saved && path.isAbsolute(saved) ? saved : defaultFolder; };
  const get = id => {
    const row = db.prepare('SELECT * FROM transcriptions WHERE id=?').get(id);
    if (!row) throw new Error('Transcription not found.');
    return { id: row.id, createdAt: row.created_at, name: row.source_name, sourcePath: row.source_path,
      language: row.language, quality: row.quality, device: row.device, text: row.text,
      segments: JSON.parse(row.segments), folder: row.folder, saveError: row.save_error };
  };
  async function exportRecord(id) {
    const record = get(id);
    let destination = record.folder;
    try {
      if (destination) {
        await fs.mkdir(destination, { recursive: true });
      } else {
        const base = folder();
        const name = safeName(record.name);
        await fs.mkdir(base, { recursive: true });
        for (let number = 1; ; number++) {
          const candidate = path.join(base, number === 1 ? name : `${name} (${number})`);
          try {
            await fs.mkdir(candidate);
            destination = candidate;
            break;
          } catch (error) {
            if (error.code !== 'EEXIST') throw error;
          }
        }
        // Keep edits in this folder even if an export only partially succeeds.
        db.prepare('UPDATE transcriptions SET folder=? WHERE id=?').run(destination, id);
      }
      for (const format of ['txt', 'srt', 'vtt']) {
        const file = path.join(destination, `transcript.${format}`);
        const data = format === 'txt' ? record.text : subtitles(record.segments, format);
        await fs.writeFile(`${file}.tmp`, '\ufeff' + data, 'utf8');
        await fs.rename(`${file}.tmp`, file);
      }
      const dataFile = path.join(destination, 'transcript.json');
      await fs.writeFile(`${dataFile}.tmp`, JSON.stringify({
        id: record.id, createdAt: record.createdAt, name: record.name,
        sourcePath: record.sourcePath, language: record.language,
        quality: record.quality, device: record.device,
        text: record.text, segments: record.segments,
      }, null, 2), 'utf8');
      await fs.rename(`${dataFile}.tmp`, dataFile);
      db.prepare('UPDATE transcriptions SET folder=?, save_error=NULL WHERE id=?').run(destination, id);
      return get(id);
    } catch (error) {
      db.prepare('UPDATE transcriptions SET save_error=? WHERE id=?').run(error.message, id);
      return get(id);
    }
  }
  return {
    folder,
    setFolder(value) {
      if (typeof value !== 'string' || !path.isAbsolute(value)) throw new Error('Choose an absolute folder path.');
      db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('saveFolder', value);
    },
    list(limit = 50, offset = 0) {
      const rows = db.prepare(`SELECT id, created_at AS createdAt, source_name AS name, language,
        substr(text,1,160) AS preview, segment_count AS passageCount, folder, save_error AS saveError
        FROM transcriptions ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`).all(Math.min(100, Math.max(1, Number(limit) || 50)), Math.max(0, Number(offset) || 0));
      return rows;
    },
    get,
    async add({ sourcePath, language, quality, device, segments }) {
      const id = randomUUID();
      const text = segments.map(s => s.text).join('\n');
      db.prepare(`INSERT INTO transcriptions(id,created_at,source_name,source_path,language,quality,device,text,segments,segment_count)
        VALUES(?,?,?,?,?,?,?,?,?,?)`).run(id, new Date().toISOString(), path.basename(sourcePath), sourcePath, language, quality, device, text, JSON.stringify(segments), segments.length);
      return exportRecord(id);
    },
    async update(id, segments) {
      if (!Array.isArray(segments) || segments.some(s => typeof s.text !== 'string' || !Number.isFinite(s.start) || !Number.isFinite(s.end) || s.start < 0 || s.end < s.start)) throw new Error('Invalid passages.');
      get(id);
      db.prepare('UPDATE transcriptions SET text=?, segments=?, segment_count=? WHERE id=?').run(segments.map(s => s.text).join('\n'), JSON.stringify(segments), segments.length, id);
      return exportRecord(id);
    },
    retry(id) { get(id); db.prepare('UPDATE transcriptions SET folder=NULL WHERE id=?').run(id); return exportRecord(id); },
    close() { db.close(); },
  };
}
module.exports = { defaultSaveFolder, createHistoryStore, localDay, safeName };
