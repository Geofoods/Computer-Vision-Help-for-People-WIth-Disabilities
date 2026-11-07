const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('handtapOverlay', {
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('handtap:overlay-status', listener);
    return () => ipcRenderer.removeListener('handtap:overlay-status', listener);
  },
});
