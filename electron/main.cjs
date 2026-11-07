const electron = require('electron');
// Editor terminals set ELECTRON_RUN_AS_NODE, which makes Electron start in plain Node mode.
if (typeof electron === 'string') {
  const { spawn } = require('node:child_process');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(electron, process.argv.slice(1), { stdio: 'inherit', env });
  child.on('exit', (code) => process.exit(code ?? 0));
  return;
}
const { app, BrowserWindow, globalShortcut, ipcMain, session, screen } = electron;
const path = require('node:path');
const { createMouse } = require('./mouse.cjs');

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const TOGGLE_HOTKEY = 'CommandOrControl+Alt+H';
const TYPING_HOTKEY = 'CommandOrControl+Alt+N';

// Hand tracking has to keep running while another app is in front, since that's
// the app the user is trying to control.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const mouse = createMouse();
let mainWindow = null;
let overlayWindow = null;
let hotkeyRegistered = false;
let typingHotkeyRegistered = false;

ipcMain.handle('handtap:click', (_event, position) => mouse.click(position));
ipcMain.handle('handtap:right-click', (_event, position) => mouse.rightClick(position));
ipcMain.handle('handtap:double-click', (_event, position) => mouse.doubleClick(position));
ipcMain.handle('handtap:toggle-drag', (_event, position) => mouse.toggleDrag(position));
ipcMain.handle('handtap:release-drag', () => mouse.releaseDrag());
ipcMain.handle('handtap:scroll', (_event, amount) =>
  amount === undefined ? mouse.scrollDown() : mouse.scrollBy(amount),
);
ipcMain.handle('handtap:scroll-up', () => mouse.scrollUp());
ipcMain.handle('handtap:press-keys', (_event, combo) => mouse.pressKeys(combo));
ipcMain.handle('handtap:system-status', () => ({
  uptime: process.uptime(),
  memory: {
    heapUsed: process.memoryUsage().heapUsed,
    heapTotal: process.memoryUsage().heapTotal,
    rss: process.memoryUsage().rss,
  },
  helperRunning: Boolean(mouse.isHelperRunning?.() ?? false),
  dragging: Boolean(mouse.isDragging?.() ?? false),
  platform: process.platform,
  version: '0.1.0',
}));

ipcMain.on('handtap:move', (_event, position) => {
  try {
    mouse.move(position);
  } catch (error) {
    console.warn(error.message);
  }
});

ipcMain.on('handtap:emit-aura', (_event, payload) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('handtap:overlay-aura', payload);
  }
});

ipcMain.on('handtap:sync-overlay', (_event, state) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('handtap:overlay-state', state);
  }
});

ipcMain.handle('handtap:hotkey', () => (hotkeyRegistered ? 'Ctrl + Alt + H' : null));
ipcMain.handle('handtap:typing-hotkey', () => (typingHotkeyRegistered ? 'Ctrl + Alt + N' : null));

function createOverlayWindow() {
  const display = screen.getPrimaryDisplay();
  const { x, y, width, height } = display.bounds;
  overlayWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    transparent: true,
    frame: false,
    focusable: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    hasShadow: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-overlay.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
  overlayWindow.loadFile(path.join(__dirname, 'overlay.html'));
  overlayWindow.on('closed', () => {
    overlayWindow = null;
  });
}

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1320, Math.max(980, width - 96)),
    height: Math.min(920, Math.max(720, height - 72)),
    minWidth: 860,
    minHeight: 680,
    title: 'HandTap',
    backgroundColor: '#171717',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      overlayWindow.close();
    }
  });

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  if (isDevelopment) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
  createOverlayWindow();
  mouse.warmUp();
  // The keyboard way out when the hand is driving the real mouse.
  hotkeyRegistered = globalShortcut.register(TOGGLE_HOTKEY, () => {
    mainWindow?.webContents.send('handtap:toggle-control');
  });
  if (!hotkeyRegistered) console.warn(`Could not register ${TOGGLE_HOTKEY}.`);
  // A hotkey because clicking HandTap would take focus from the app being typed into.
  typingHotkeyRegistered = globalShortcut.register(TYPING_HOTKEY, () => {
    mainWindow?.webContents.send('handtap:toggle-typing');
  });
  if (!typingHotkeyRegistered) console.warn(`Could not register ${TYPING_HOTKEY}.`);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      createOverlayWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  mouse.dispose();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
