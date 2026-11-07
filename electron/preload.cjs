const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('handtapDesktop', {
  isDesktop: true,
});
