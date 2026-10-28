const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('transcriber', {
  historyList: (limit, offset) => ipcRenderer.invoke('history:list', limit, offset),
  historyGet: id => ipcRenderer.invoke('history:get', id),
  historyUpdate: (id, segments) => ipcRenderer.invoke('history:update', id, segments),
  historyRetry: id => ipcRenderer.invoke('history:retry', id),
  saveFolder: () => ipcRenderer.invoke('settings:folder'),
  chooseSaveFolder: locale => ipcRenderer.invoke('settings:choose-folder', locale),
  openFolder: id => ipcRenderer.invoke('history:open-folder', id),
  status: () => ipcRenderer.invoke('status'),
  choose: () => ipcRenderer.invoke('choose'),
  transcribe: (language, device, quality) => ipcRenderer.invoke('transcribe', language, device, quality),
  cancel: () => ipcRenderer.invoke('cancel'),
  save: data => ipcRenderer.invoke('save', data),
  copy: text => ipcRenderer.invoke('copy', text),
  onProgress: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('progress', listener);
    return () => ipcRenderer.removeListener('progress', listener);
  },
});
