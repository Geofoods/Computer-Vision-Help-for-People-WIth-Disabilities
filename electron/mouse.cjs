const { spawn } = require('node:child_process');
const { comboToKeyCodes } = require('./keys.cjs');

// A long-running PowerShell process that reads mouse and key commands from stdin. Starting
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
  [DllImport("user32.dll")] public static extern uint MapVirtualKey(uint code, uint mapType);
  [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extraInfo);
  public static void Scroll(int amount) {
    mouse_event(0x0800, 0, 0, unchecked((uint)amount), UIntPtr.Zero);
  }
}
'@
[HandTapMouse]::SetProcessDPIAware() | Out-Null
$culture = [Globalization.CultureInfo]::InvariantCulture
# Windows reads these as numpad keys, or ignores them, without the extended-key flag.
$extendedKeys = @(0x21..0x28) + @(0x2D, 0x2E, 0x5B) + @(0xAD..0xB3)
function Send-Key([int]$code, [uint32]$flags) {
  if ($extendedKeys -contains $code) { $flags = $flags -bor 1 }
  $scan = [byte]([HandTapMouse]::MapVirtualKey($code, 0) -band 0xFF)
  [HandTapMouse]::keybd_event([byte]$code, $scan, $flags, [UIntPtr]::Zero)
}
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $parts = $line.Split(' ')
  if ($parts[0] -eq 'keys') {
    $codes = @($parts[1].Split(','))
    foreach ($code in $codes) { Send-Key $code 0 }
    Start-Sleep -Milliseconds 20
    for ($i = $codes.Length - 1; $i -ge 0; $i--) { Send-Key $codes[$i] 2 }
    continue
  }
  if ($parts[0] -eq 'scroll') {
    [HandTapMouse]::Scroll([int]$parts[1])
    continue
  }
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

const SCROLL_DOWN_AMOUNT = -600;

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

  function assertSupported() {
    if (process.platform !== 'win32') {
      throw new Error('Native mouse control is currently supported on Windows.');
    }
  }

  function send(command, position) {
    assertSupported();
    const { x, y } = assertPosition(position);
    getHelper().stdin.write(`${command} ${x.toFixed(5)} ${y.toFixed(5)}\n`);
  }

  return {
    move: (position) => send('move', position),
    click: (position) => send('click', position),
    pressKeys(combo) {
      assertSupported();
      getHelper().stdin.write(`keys ${comboToKeyCodes(combo).join(',')}\n`);
    },
    scrollDown() {
      assertSupported();
      getHelper().stdin.write(`scroll ${SCROLL_DOWN_AMOUNT}\n`);
    },
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
