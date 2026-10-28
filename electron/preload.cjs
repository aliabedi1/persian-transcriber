const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('transcriber', {
  status: () => ipcRenderer.invoke('status'),
  choose: () => ipcRenderer.invoke('choose'),
  transcribe: (language, device) => ipcRenderer.invoke('transcribe', language, device),
  cancel: () => ipcRenderer.invoke('cancel'),
  save: data => ipcRenderer.invoke('save', data),
  copy: text => ipcRenderer.invoke('copy', text),
  onProgress: callback => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('progress', listener);
    return () => ipcRenderer.removeListener('progress', listener);
  },
});
