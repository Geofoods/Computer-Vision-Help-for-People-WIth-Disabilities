const { app, BrowserWindow, globalShortcut, ipcMain, session, screen } = require('electron');
const path = require('node:path');
const { createMouse } = require('./mouse.cjs');

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const TOGGLE_HOTKEY = 'CommandOrControl+Alt+H';

// Hand tracking has to keep running while another app is in front, since that's
// the app the user is trying to control.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

const mouse = createMouse();
let mainWindow = null;
let hotkeyRegistered = false;

ipcMain.handle('handtap:click', (_event, position) => mouse.click(position));
ipcMain.handle('handtap:scroll', () => mouse.scrollDown());
ipcMain.handle('handtap:press-keys', (_event, combo) => mouse.pressKeys(combo));
ipcMain.on('handtap:move', (_event, position) => {
  try {
    mouse.move(position);
  } catch (error) {
    console.warn(error.message);
  }
});
ipcMain.handle('handtap:hotkey', () => (hotkeyRegistered ? 'Ctrl + Alt + H' : null));

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  mainWindow = new BrowserWindow({
    width: Math.min(1240, Math.max(980, width - 120)),
    height: Math.min(900, Math.max(720, height - 90)),
    minWidth: 860,
    minHeight: 680,
    title: 'HandTap',
    backgroundColor: '#f7f8fc',
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
  mouse.warmUp();
  // The keyboard way out when the hand is driving the real mouse.
  hotkeyRegistered = globalShortcut.register(TOGGLE_HOTKEY, () => {
    mainWindow?.webContents.send('handtap:toggle-control');
  });
  if (!hotkeyRegistered) console.warn(`Could not register ${TOGGLE_HOTKEY}.`);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  mouse.dispose();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
