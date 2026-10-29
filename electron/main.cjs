const { runtimePaths } = require('./engine.cjs');
const { app, BrowserWindow, ipcMain, dialog, clipboard, session, shell, desktopCapturer } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { transcribe, subtitles, detectGpu } = require('./engine.cjs');
const { createHistoryStore, defaultSaveFolder } = require('./history.cjs');
const { createModelStore } = require('./models.cjs');
const { createRecordingStore } = require('./recordings.cjs');
const { createLiveEngine, createLiveSession } = require('./live-engine.cjs');
const { systemAudioCapability, startSystemAudio } = require('./system-audio.cjs');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const recordings = createRecordingStore();
const rendererUrl = pathToFileURL(path.join(__dirname, '../dist/index.html')).href;
let history, models;
if (process.env.AVA_TEST_DATA_DIR) {
  require('node:fs').mkdirSync(process.env.AVA_TEST_DATA_DIR, { recursive: true });
  app.setPath('userData', process.env.AVA_TEST_DATA_DIR);
}
const root = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
let win, selected, controller, live, liveStartup, liveController, liveStopping, systemAudio, systemStarting;
let gpuInfo;

async function exists(file) { return fs.access(file).then(() => true, () => false); }
app.whenReady().then(async () => {
  history = createHistoryStore(app.getPath('userData'), process.env.AVA_TEST_SAVE_DIR || defaultSaveFolder(key => app.getPath(key)));
  models = createModelStore(app.getPath('userData'), { onChange: () => { if (win && !win.isDestroyed()) win.webContents.send('models:changed'); } });
  // Renderer traffic stays blocked. Only explicit main-process catalog downloads use the network.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  const systemCaptureAllowed = () => process.platform === 'win32' && live && live.metadata.source !== 'microphone' && !liveStopping;
  session.defaultSession.setPermissionCheckHandler((wc, permission, _origin, details) =>
    Boolean(wc === win?.webContents && wc.getURL() === rendererUrl && details.isMainFrame &&
      ((permission === 'media' && details.mediaType === 'audio') || (permission === 'display-capture' && systemCaptureAllowed()))));
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback, details) =>
    callback(Boolean(wc === win?.webContents && wc.getURL() === rendererUrl && details.isMainFrame && details.requestingUrl === rendererUrl &&
      ((permission === 'media' && details.mediaTypes?.length === 1 && details.mediaTypes[0] === 'audio') || (permission === 'display-capture' && systemCaptureAllowed())))));
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    if (!systemCaptureAllowed() || request.frame !== win?.webContents.mainFrame || !request.audioRequested) return callback(null);
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      if (!systemCaptureAllowed() || !sources.length) return callback(null);
      callback({ video: sources[0], audio: 'loopback' });
    } catch { callback(null); }
  });
  win = new BrowserWindow({ show: false, width: 1160, height: 850, minWidth: 860, minHeight: 680, title: 'Ava — Persian Transcriber', icon: path.join(root, app.isPackaged ? (process.platform === 'win32' ? 'icon.ico' : 'icon.png') : 'src/assets/ava-icon.png'), backgroundColor: '#f4f7fa', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  await win.loadFile(path.join(__dirname, '../dist/index.html'));
});
app.on('will-quit', () => { recordings.clear(); history?.close(); });
app.on('window-all-closed', () => { controller?.abort(); liveController?.abort(); void systemAudio?.stop(); void live?.abort(); app.quit(); });
ipcMain.handle('status', async () => {
  gpuInfo = await detectGpu(root);
  const engineReady = await exists(runtimePaths(root).cpu) && await exists(runtimePaths(root).ffmpeg);
  const modelReady = await models.resolveSelected().then(() => true, () => false);
  return { gpu: gpuInfo, engineReady, ready: engineReady && modelReady };
});
ipcMain.handle('choose', async () => {
  if (controller || live || liveStartup || liveStopping) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Choose audio or video', properties: ['openFile'], filters: [{ name: 'Audio and video', extensions: ['mp3','wav','m4a','aac','ogg','opus','flac','mp4','mkv','mov','webm','avi','wma','3gp','amr'] }] });
  if (canceled) return null;
  const stat = await fs.stat(filePaths[0]);
  recordings.clear();
  selected = filePaths[0];
  return { name: path.basename(selected), size: stat.size };
});
ipcMain.handle('recording', (event, bytes, mimeType) => {
  if (event.sender !== win?.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Invalid recording source.');
  if (controller || live || liveStartup || liveStopping) throw new Error('Wait for transcription to finish.');
  const saved = recordings.save(bytes, mimeType);
  selected = saved.path;
  return { name: saved.name, size: saved.size };
});
ipcMain.handle('transcribe', async (_event, language, preference = 'auto') => {
  if (controller || live || liveStartup || liveStopping) return { error: 'A transcription is already running.' };
  if (!selected) return { error: 'Choose a file first.' };
  if (!['fa','auto','en','ar'].includes(language)) return { error: 'Unsupported language.' };
  if (!['auto','cpu','gpu'].includes(preference)) return { error: 'Invalid processor choice.' };
  controller = new AbortController();
  let model;
  try { model = await models.resolveSelected(); } catch (error) { controller = null; return { error: error.message }; }
  gpuInfo = gpuInfo || await detectGpu(root);
  if (preference === 'gpu' && !gpuInfo.available) { controller = null; return { error: 'No compatible Vulkan GPU is available. Choose CPU or Auto.' }; }
  const device = preference === 'cpu' ? 'cpu' : gpuInfo.available ? 'gpu' : 'cpu';
  try {
    const execute = device => transcribe({ input: selected, language, root, device, ...model, signal: controller.signal, onProgress: p => { if (!win.isDestroyed()) win.webContents.send('progress', p); } });
    let result;
    try { result = { ...await execute(device), device }; }
    catch (error) {
      if (preference !== 'auto' || device !== 'gpu' || controller.signal.aborted) throw error;
      win.webContents.send('progress', { stage: 'GPU unavailable. Retrying on CPU', percent: 0 });
      result = { ...await execute('cpu'), device: 'cpu', fallback: true };
    }
    try {
      const saved = await history.add({ sourcePath: selected, language, quality: model.id, device: result.device, segments: result.segments });
      return { ...result, historyId: saved.id, folder: saved.folder, saveWarning: saved.saveError };
    } catch (error) { return { ...result, saveWarning: error.message }; }
  }
  catch (error) { return { error: controller.signal.aborted ? 'Transcription cancelled.' : error.message }; }
  finally { controller = null; }
});
ipcMain.handle('cancel', () => { controller?.abort(); });
function liveSender(event) {
  if (event.sender !== win?.webContents || event.senderFrame !== win.webContents.mainFrame || event.sender.getURL() !== rendererUrl) throw new Error('Invalid live capture source.');
}
function sendLive(data) { if (win && !win.isDestroyed()) win.webContents.send('live:update', data); }
ipcMain.handle('live:capabilities', event => { liveSender(event); return systemAudioCapability(root); });
ipcMain.handle('live:start', async (event, { language, device: preference, source = 'microphone', locale = 'en' } = {}) => {
  liveSender(event);
  if (controller || live || liveStartup || liveStopping) throw new Error('A transcription is already running.');
  if (!['fa', 'auto', 'en', 'ar'].includes(language) || !['cpu', 'gpu', 'auto'].includes(preference) || !['microphone', 'system', 'both'].includes(source)) throw new Error('Invalid live capture settings.');
  if (source !== 'microphone' && !['win32', 'linux'].includes(process.platform)) throw new Error('System audio capture is not supported on this platform.');
  if (!['fa', 'en'].includes(locale)) throw new Error('Invalid interface language.');
  liveController = new AbortController();
  const signal = liveController.signal;
  liveStartup = (async () => {
    const model = await models.resolveSelected();
    gpuInfo ||= await detectGpu(root);
    let device = preference === 'cpu' ? 'cpu' : gpuInfo.available ? 'gpu' : 'cpu';
    if (preference === 'gpu' && !gpuInfo.available) throw new Error('No compatible Vulkan GPU is available. Choose CPU or Auto.');
    let engine;
    try { engine = await createLiveEngine({ root, ...model, language, device, signal }); }
    catch (error) {
      if (preference !== 'auto' || device !== 'gpu' || signal.aborted) throw error;
      device = 'cpu'; engine = await createLiveEngine({ root, ...model, language, device, signal });
    }
    if (signal.aborted) { await engine.close(); signal.throwIfAborted(); }
    live = createLiveSession({ engine, onUpdate: sendLive, onError: error => sendLive({ error }) });
    const name = source === 'microphone' ? (locale === 'fa' ? 'میکروفون' : 'Microphone') : source === 'system' ? (locale === 'fa' ? 'صدای سیستم' : 'System audio') : (locale === 'fa' ? 'میکروفون و سیستم' : 'Microphone + system');
    live.metadata = { language, quality: model.id, device, source, sourceName: `${locale === 'fa' ? 'تبدیل زنده' : 'Live transcription'} · ${name}` };
    return { device };
  })();
  try { return await liveStartup; }
  finally { liveStartup = null; if (!live) liveController = null; }
});
ipcMain.handle('live:audio', (event, bytes) => { liveSender(event); if (!live) throw new Error('Start live capture first.'); live.push(bytes); });
ipcMain.handle('live:system-start', async event => {
  liveSender(event);
  if (process.platform !== 'linux' || !live || live.metadata.source === 'microphone' || liveStopping || systemAudio || systemStarting) throw new Error('System capture is not available.');
  systemStarting = (async () => {
    const capability = await systemAudioCapability(root);
    if (!capability.system) throw new Error(capability.reason);
    systemAudio = await startSystemAudio({ root, monitor: capability.monitor, signal: liveController?.signal,
      onAudio: bytes => { if (win && !win.isDestroyed()) win.webContents.send('live:system-audio', bytes); },
      onError: error => sendLive({ error }),
    });
  })();
  try { await systemStarting; } finally { systemStarting = null; }
});
ipcMain.handle('live:system-stop', async event => {
  liveSender(event); await systemStarting?.catch(() => {}); await systemAudio?.stop(); systemAudio = null;
});
ipcMain.handle('live:stop', async (event, { discard = false } = {}) => {
  liveSender(event);
  if (typeof discard !== 'boolean') throw new Error('Invalid live stop request.');
  if (liveStopping) return liveStopping;
  if (liveStartup) { liveController?.abort(); await liveStartup.catch(() => {}); }
  if (!live) return { segments: [] };
  const session = live;
  liveStopping = (async () => {
    try {
      await systemStarting?.catch(() => {}); await systemAudio?.stop(); systemAudio = null;
      const result = await session.stop();
      if (discard) return result;
      selected = null;
      try {
        const saved = await history.add({ sourcePath: `ava-live:${randomUUID()}`, ...session.metadata, segments: result.segments });
        return { ...result, historyId: saved.id, folder: saved.folder, saveWarning: saved.saveError };
      } catch (error) { return { ...result, saveWarning: error.message }; }
    } finally { live = null; liveStopping = null; liveController = null; }
  })();
  return liveStopping;
});
ipcMain.handle('copy', (_event, text) => { if (typeof text === 'string') clipboard.writeText(text); });
ipcMain.handle('save', async (_event, { format, text, segments }) => {
  if (!['txt','srt','vtt'].includes(format) || typeof text !== 'string' || !Array.isArray(segments)) throw new Error('Invalid export');
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: `${path.parse(selected || 'transcript').name}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
  if (canceled) return false;
  await fs.writeFile(filePath, '\ufeff' + (format === 'txt' ? text : subtitles(segments, format)), 'utf8');
  return true;
});

ipcMain.handle('history:list', (_event, limit, offset) => history.list(limit, offset));
ipcMain.handle('history:get', (_event, id) => { if (controller || live || liveStartup || liveStopping) throw new Error('Wait for transcription to finish.'); const record = history.get(id); selected = record.sourcePath.startsWith('ava-live:') ? null : record.sourcePath; return record; });
ipcMain.handle('history:update', (_event, id, segments) => history.update(id, segments));
ipcMain.handle('history:retry', (_event, id) => history.retry(id));
ipcMain.handle('settings:folder', () => history.folder());
ipcMain.handle('settings:choose-folder', async (_event, locale = 'fa') => {
  const result = await dialog.showOpenDialog(win, { title: locale === 'en' ? 'Save transcripts to' : 'پوشهٔ ذخیرهٔ متن‌ها', defaultPath: history.folder(), properties: ['openDirectory', 'createDirectory'] });
  if (!result.canceled) history.setFolder(result.filePaths[0]);
  return history.folder();
});
ipcMain.handle('history:open-folder', async (_event, id) => {
  const target = id ? history.get(id).folder : history.folder();
  if (!target) throw new Error('Files have not been saved yet.');
  await fs.mkdir(target, { recursive: true });
  const error = await shell.openPath(target); if (error) throw new Error(error);
});

ipcMain.handle('models:list', () => models.list());
ipcMain.handle('models:download', (_event, id) => models.download(id));
ipcMain.handle('models:select', (_event, id) => models.select(id));
