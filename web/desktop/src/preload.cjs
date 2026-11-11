const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('bitchordDesktop', {
  version: '1.9.1-desktop.1',
  request: (message) => ipcRenderer.invoke('bitchord:request', message),
  subscribe: (listener) => {
    const handler = (_event, value) => listener(value);
    ipcRenderer.on('bitchord:event', handler);
    return () => ipcRenderer.removeListener('bitchord:event', handler);
  },
});
