const { app, BrowserWindow, session, screen, ipcMain } = require('electron');
const { execFile } = require('node:child_process');
const path = require('node:path');

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

ipcMain.handle('handtap:click', async (_event, position) => {
  if (process.platform !== 'win32') {
    throw new Error('Native desktop clicking is currently supported on Windows.');
  }

  const x = Number(position?.x);
  const y = Number(position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    throw new Error('Invalid cursor position.');
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  const screenX = Math.round(x * (width - 1));
  const screenY = Math.round(y * (height - 1));
  const script = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class HandTapMouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
}
'@
[HandTapMouse]::SetCursorPos(${screenX}, ${screenY}) | Out-Null
[HandTapMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
[HandTapMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
`;

  await new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], (error) => {
      if (error) reject(new Error('Windows could not perform the desktop click.'));
      else resolve();
    });
  });
});

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
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
