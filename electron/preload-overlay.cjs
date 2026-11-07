const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('handtapOverlay', {
  onAura: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('handtap:overlay-aura', listener);
    return () => ipcRenderer.removeListener('handtap:overlay-aura', listener);
  },
  onState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('handtap:overlay-state', listener);
    return () => ipcRenderer.removeListener('handtap:overlay-state', listener);
  },
});

