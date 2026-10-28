const { app, BrowserWindow, ipcMain, dialog, clipboard, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { transcribe, subtitles } = require('./engine.cjs');
const root = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..');
let win, selected, controller;

async function exists(file) { return fs.access(file).then(() => true, () => false); }
app.whenReady().then(async () => {
  // The finished application has no remote content, telemetry or network access.
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (_details, callback) => callback({ cancel: true }));
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
  win = new BrowserWindow({ width: 1160, height: 850, minWidth: 860, minHeight: 680, title: 'Ava — Persian Transcriber', backgroundColor: '#f4f7fa', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', event => event.preventDefault());
  await win.loadFile(path.join(__dirname, '../dist/index.html'));
});
app.on('window-all-closed', () => { controller?.abort(); app.quit(); });
ipcMain.handle('status', async () => {
  const model = path.join(root, 'models/ggml-large-v3-turbo-q5_0.bin');
  const size = await fs.stat(model).then(s => s.size, () => 0);
  return { ready: size === 574041195 && await exists(path.join(root, 'runtime/whisper/Release/whisper-cli.exe')) && await exists(path.join(root, 'runtime/ffmpeg/ffmpeg.exe')), modelSize: size };
});
ipcMain.handle('choose', async () => {
  if (controller) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, { title: 'Choose audio or video', properties: ['openFile'], filters: [{ name: 'Audio and video', extensions: ['mp3','wav','m4a','aac','ogg','opus','flac','mp4','mkv','mov','webm','avi','wma','3gp','amr'] }] });
  if (canceled) return null;
  selected = filePaths[0];
  const stat = await fs.stat(selected);
  return { name: path.basename(selected), size: stat.size };
});
ipcMain.handle('transcribe', async (_event, language) => {
  if (controller) return { error: 'A transcription is already running.' };
  if (!selected) return { error: 'Choose a file first.' };
  if (!['fa','auto','en','ar'].includes(language)) return { error: 'Unsupported language.' };
  controller = new AbortController();
  try { return await transcribe({ input: selected, language, root, signal: controller.signal, onProgress: p => { if (!win.isDestroyed()) win.webContents.send('progress', p); } }); }
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
