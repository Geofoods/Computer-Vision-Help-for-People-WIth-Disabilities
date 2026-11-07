const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('handtapDesktop', {
  isDesktop: true,
  clickAt: (position) => ipcRenderer.invoke('handtap:click', position),
  moveTo: (position) => ipcRenderer.send('handtap:move', position),
  getHotkey: () => ipcRenderer.invoke('handtap:hotkey'),
  onToggleControl: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('handtap:toggle-control', listener);
    return () => ipcRenderer.removeListener('handtap:toggle-control', listener);
  },
});
