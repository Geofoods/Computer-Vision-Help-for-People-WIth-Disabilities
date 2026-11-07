const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('handtapDesktop', {
  isDesktop: true,
  clickAt: (position) => ipcRenderer.invoke('handtap:click', position),
});
