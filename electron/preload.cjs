const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('handtapDesktop', {
  isDesktop: true,
  moveAt: (position) => ipcRenderer.invoke('handtap:move', position),
  clickAt: (position) => ipcRenderer.invoke('handtap:click', position),
});
