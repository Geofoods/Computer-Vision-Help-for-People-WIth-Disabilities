const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('handtapDesktop', {
  isDesktop: true,
  clickAt: (position) => ipcRenderer.invoke('handtap:click', position),
  rightClickAt: (position) => ipcRenderer.invoke('handtap:right-click', position),
  doubleClickAt: (position) => ipcRenderer.invoke('handtap:double-click', position),
  toggleDragAt: (position) => ipcRenderer.invoke('handtap:toggle-drag', position),
  releaseDrag: () => ipcRenderer.invoke('handtap:release-drag'),
  moveTo: (position) => ipcRenderer.send('handtap:move', position),
  scrollDown: () => ipcRenderer.invoke('handtap:scroll'),
  scrollUp: () => ipcRenderer.invoke('handtap:scroll-up'),
  scroll: (delta) => ipcRenderer.invoke('handtap:scroll', delta),
  scrollBy: (amount) => ipcRenderer.invoke('handtap:scroll', amount),
  pressKeys: (combo) => ipcRenderer.invoke('handtap:press-keys', combo),
  emitAura: (payload) => ipcRenderer.send('handtap:emit-aura', payload),
  syncOverlay: (state) => ipcRenderer.send('handtap:sync-overlay', state),
  getSystemStatus: () => ipcRenderer.invoke('handtap:system-status'),
  getHotkey: () => ipcRenderer.invoke('handtap:hotkey'),
  getTypingHotkey: () => ipcRenderer.invoke('handtap:typing-hotkey'),
  setOverlayStatus: (status) => ipcRenderer.send('handtap:overlay-status', status),
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
