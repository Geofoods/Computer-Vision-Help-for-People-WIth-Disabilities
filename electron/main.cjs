const { app, BrowserWindow, session, screen, ipcMain } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
let mouseHelper;

function startMouseHelper() {
  if (process.platform !== 'win32') return;
  const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class HandTapMouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
  public static void Scroll(int amount) {
    mouse_event(0x0800, 0, 0, unchecked((uint)amount), [UIntPtr]::Zero);
  }
}
'@
while ($line = [Console]::In.ReadLine()) {
  $command = $line | ConvertFrom-Json
  [HandTapMouse]::SetCursorPos([int]$command.x, [int]$command.y) | Out-Null
  if ($command.click) {
    [HandTapMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    [HandTapMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  }
  if ($command.scroll) {
    [HandTapMouse]::Scroll(-[int]$command.scroll)
  }
}
`;
  mouseHelper = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    stdio: ['pipe', 'ignore', 'ignore'],
    windowsHide: true,
  });
  mouseHelper.on('exit', () => {
    mouseHelper = undefined;
  });
}

function writeMouseCommand(position, click = false, scroll = 0) {
  if (process.platform !== 'win32') {
    throw new Error('Native desktop clicking is currently supported on Windows.');
  }

  const rawX = Number(position?.x);
  const rawY = Number(position?.y);
  if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
    throw new Error('Invalid cursor position.');
  }
  const x = Math.max(0, Math.min(1, rawX));
  const y = Math.max(0, Math.min(1, rawY));

  if (!mouseHelper?.stdin?.writable) throw new Error('The native mouse helper is unavailable.');
  const { x: originX, y: originY, width, height } = screen.getPrimaryDisplay().bounds;
  mouseHelper.stdin.write(`${JSON.stringify({
    x: originX + Math.round(x * (width - 1)),
    y: originY + Math.round(y * (height - 1)),
    click,
    scroll,
  })}\n`);
}

ipcMain.handle('handtap:move', (_event, position) => writeMouseCommand(position));
ipcMain.handle('handtap:click', (_event, position) => writeMouseCommand(position, true));
ipcMain.handle('handtap:scroll', () => writeMouseCommand({ x: 0, y: 0 }, false, 600));

function createWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const window = new BrowserWindow({
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

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'media');
  });

  if (isDevelopment) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  startMouseHelper();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  mouseHelper?.kill();
  if (process.platform !== 'darwin') app.quit();
});
