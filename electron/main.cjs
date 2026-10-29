const { runtimePaths } = require('./engine.cjs');
const { app, BrowserWindow, ipcMain, dialog, clipboard, session, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { transcribe, subtitles, detectGpu } = require('./engine.cjs');
const { createHistoryStore, defaultSaveFolder } = require('./history.cjs');
const { createModelStore } = require('./models.cjs');
let history, models;
if (process.env.AVA_TEST_DATA_DIR) {
  require('node:fs').mkdirSync(process.env.AVA_TEST_DATA_DIR, { recursive: true });
  app.setPath('userData', process.env.AVA_TEST_DATA_DIR);
}
const root = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
let win, selected, controller;
let gpuInfo;

async function exists(file) { return fs.access(file).then(() => true, () => false); }
app.whenReady().then(async () => {
  history = createHistoryStore(app.getPath('userData'), process.env.AVA_TEST_SAVE_DIR || defaultSaveFolder(key => app.getPath(key)));
  models = createModelStore(app.getPath('userData'), { onChange: () => { if (win && !win.isDestroyed()) win.webContents.send('models:changed'); } });
  // Renderer traffic stays blocked. Only explicit main-process catalog downloads use the network.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win = new BrowserWindow({ show: false, width: 1160, height: 850, minWidth: 860, minHeight: 680, title: 'Ava — Persian Transcriber', icon: path.join(root, app.isPackaged ? (process.platform === 'win32' ? 'icon.ico' : 'icon.png') : 'src/assets/ava-icon.png'), backgroundColor: '#f4f7fa', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  await win.loadFile(path.join(__dirname, '../dist/index.html'));
});
app.on('will-quit', () => history?.close());
app.on('window-all-closed', () => { controller?.abort(); app.quit(); });
ipcMain.handle('status', async () => {
  gpuInfo = await detectGpu(root);
  const engineReady = await exists(runtimePaths(root).cpu) && await exists(runtimePaths(root).ffmpeg);
  const modelReady = await models.resolveSelected().then(() => true, () => false);
  return { gpu: gpuInfo, engineReady, ready: engineReady && modelReady };
});
ipcMain.handle('choose', async () => {
  if (controller) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Choose audio or video', properties: ['openFile'], filters: [{ name: 'Audio and video', extensions: ['mp3','wav','m4a','aac','ogg','opus','flac','mp4','mkv','mov','webm','avi','wma','3gp','amr'] }] });
  if (canceled) return null;
  selected = filePaths[0];
  const stat = await fs.stat(selected);
  return { name: path.basename(selected), size: stat.size };
});
ipcMain.handle('transcribe', async (_event, language, preference = 'auto') => {
  if (controller) return { error: 'A transcription is already running.' };
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
ipcMain.handle('copy', (_event, text) => { if (typeof text === 'string') clipboard.writeText(text); });
ipcMain.handle('save', async (_event, { format, text, segments }) => {
  if (!['txt','srt','vtt'].includes(format) || typeof text !== 'string' || !Array.isArray(segments)) throw new Error('Invalid export');
  const { canceled, filePath } = await dialog.showSaveDialog(win, { defaultPath: `${path.parse(selected || 'transcript').name}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] });
  if (canceled) return false;
  await fs.writeFile(filePath, '\ufeff' + (format === 'txt' ? text : subtitles(segments, format)), 'utf8');
  return true;
});

ipcMain.handle('history:list', (_event, limit, offset) => history.list(limit, offset));
ipcMain.handle('history:get', (_event, id) => { if (controller) throw new Error('Wait for transcription to finish.'); const record = history.get(id); selected = record.sourcePath; return record; });
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
