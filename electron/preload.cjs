const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('handtapDesktop', {
  isDesktop: true,
  clickAt: (position) => ipcRenderer.invoke('handtap:click', position),
  moveTo: (position) => ipcRenderer.send('handtap:move', position),
  scrollDown: () => ipcRenderer.invoke('handtap:scroll'),
  scrollBy: (amount) => ipcRenderer.invoke('handtap:scroll', amount),
  pressKeys: (combo) => ipcRenderer.invoke('handtap:press-keys', combo),
  getHotkey: () => ipcRenderer.invoke('handtap:hotkey'),
  getTypingHotkey: () => ipcRenderer.invoke('handtap:typing-hotkey'),
  onToggleTyping: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('handtap:toggle-typing', listener);
    return () => ipcRenderer.removeListener('handtap:toggle-typing', listener);
  },
  onToggleControl: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('handtap:toggle-control', listener);
    return () => ipcRenderer.removeListener('handtap:toggle-control', listener);
  },
});
