const { spawn } = require('node:child_process');

// A long-running PowerShell process that reads mouse commands from stdin. Starting
// PowerShell takes hundreds of milliseconds, which is far too slow to do per movement.
//
// The process declares itself DPI aware and scales against the physical screen size,
// so a normalised position lands correctly at any Windows display scaling.
const HELPER_SCRIPT = `
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class HandTapMouse {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern int GetSystemMetrics(int index);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
}
'@
[HandTapMouse]::SetProcessDPIAware() | Out-Null
$culture = [Globalization.CultureInfo]::InvariantCulture
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $parts = $line.Split(' ')
  $width = [HandTapMouse]::GetSystemMetrics(0)
  $height = [HandTapMouse]::GetSystemMetrics(1)
  $x = [int][Math]::Round([double]::Parse($parts[1], $culture) * ($width - 1))
  $y = [int][Math]::Round([double]::Parse($parts[2], $culture) * ($height - 1))
  [HandTapMouse]::SetCursorPos($x, $y) | Out-Null
  if ($parts[0] -eq 'click') {
    [HandTapMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 20
    [HandTapMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  }
}
`;

function assertPosition(position) {
  const x = Number(position?.x);
  const y = Number(position?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) {
    throw new Error('Invalid cursor position.');
  }
  return { x, y };
}

function createMouse(spawnProcess = spawn) {
  let helper = null;

  function getHelper() {
    if (helper) return helper;
    const encoded = Buffer.from(HELPER_SCRIPT, 'utf16le').toString('base64');
    const child = spawnProcess(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true },
    );
    // Forget a dead helper so the next command starts a new one.
    const forget = () => {
      if (helper === child) helper = null;
    };
    child.on('error', forget);
    child.on('exit', forget);
    child.stdin.on('error', forget);
    helper = child;
    return child;
  }

  function send(command, position) {
    if (process.platform !== 'win32') {
      throw new Error('Native mouse control is currently supported on Windows.');
    }
    const { x, y } = assertPosition(position);
    getHelper().stdin.write(`${command} ${x.toFixed(5)} ${y.toFixed(5)}\n`);
  }

  return {
    move: (position) => send('move', position),
    click: (position) => send('click', position),
    // Starts the helper ahead of time so the first gesture isn't delayed.
    warmUp() {
      if (process.platform === 'win32') getHelper();
    },
    dispose() {
      if (helper) helper.stdin.end();
      helper = null;
    },
  };
}

module.exports = { createMouse };
