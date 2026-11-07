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
    if ($parts.Length -lt 2 -or [string]::IsNullOrWhiteSpace($parts[1])) { continue }
    $codes = @($parts[1].Split(','))
    foreach ($code in $codes) { Send-Key $code 0 }
    Start-Sleep -Milliseconds 12
    for ($i = $codes.Length - 1; $i -ge 0; $i--) { Send-Key $codes[$i] 2 }
    continue
  }
  if ($parts[0] -eq 'scroll') {
    [HandTapMouse]::Scroll([int]$parts[1])
    continue
  }
  if ($parts[0] -eq 'release') {
    [HandTapMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    continue
  }
  $width = [HandTapMouse]::GetSystemMetrics(0)
  $height = [HandTapMouse]::GetSystemMetrics(1)
  $x = [int][Math]::Round([double]::Parse($parts[1], $culture) * ($width - 1))
  $y = [int][Math]::Round([double]::Parse($parts[2], $culture) * ($height - 1))
  [HandTapMouse]::SetCursorPos($x, $y) | Out-Null
  if ($parts[0] -eq 'mouse-down') {
    [HandTapMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  }
  if ($parts[0] -eq 'mouse-up') {
    [HandTapMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  }
  if ($parts[0] -eq 'click') {
    [HandTapMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 12
    [HandTapMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  }
  if ($parts[0] -eq 'right-click') {
    [HandTapMouse]::mouse_event(0x0008, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 12
    [HandTapMouse]::mouse_event(0x0010, 0, 0, 0, [UIntPtr]::Zero)
  }
  if ($parts[0] -eq 'double-click') {
    [HandTapMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 12
    [HandTapMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 32
    [HandTapMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
    Start-Sleep -Milliseconds 12
    [HandTapMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
  }
}
`;

const SCROLL_DOWN_AMOUNT = -720;
const SCROLL_UP_AMOUNT = 720;

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
  let dragging = false;

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
      if (helper === child) {
        helper = null;
        dragging = false;
      }
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
    click: (position) => {
      dragging = false;
      send('click', position);
    },
    rightClick: (position) => {
      dragging = false;
      send('right-click', position);
    },
    doubleClick: (position) => {
      dragging = false;
      send('double-click', position);
    },
    mouseDown: (position) => {
      dragging = true;
      send('mouse-down', position);
    },
    mouseUp: (position) => {
      dragging = false;
      send('mouse-up', position);
    },
    toggleDrag(position) {
      if (dragging) {
        dragging = false;
        send('mouse-up', position);
        return false;
      }
      dragging = true;
      send('mouse-down', position);
      return true;
    },
    releaseDrag() {
      if (!dragging) return false;
      dragging = false;
      if (helper && process.platform === 'win32') {
        helper.stdin.write('release\n');
      }
      return true;
    },
    isDragging() {
      return dragging;
    },
    pressKeys(combo) {
      assertSupported();
      const codes = comboToKeyCodes(combo);
      if (codes.length === 0) return;
      getHelper().stdin.write(`keys ${codes.join(',')}\n`);
    },
    scrollBy(amount) {
      assertSupported();
      const value = Number(amount);
      if (!Number.isFinite(value) || value === 0 || Math.abs(value) > 6000) {
        throw new Error('Invalid scroll amount.');
      }
      getHelper().stdin.write(`scroll ${Math.trunc(value)}\n`);
    },
    scrollDown() {
      this.scrollBy(SCROLL_DOWN_AMOUNT);
    },
    scrollUp() {
      this.scrollBy(SCROLL_UP_AMOUNT);
    },
    scroll(amount = SCROLL_DOWN_AMOUNT) {
      assertSupported();
      const sanitized = Math.max(-100000, Math.min(100000, Math.round(Number(amount) || 0)));
      getHelper().stdin.write(`scroll ${sanitized}\n`);
    },
    isHelperRunning() {
      return helper !== null;
    },
    // Starts the helper ahead of time so the first gesture isn't delayed.
    warmUp() {
      if (process.platform === 'win32') getHelper();
    },
    dispose() {
      if (helper) {
        if (dragging) helper.stdin.write('release\n');
        helper.stdin.end();
      }
      dragging = false;
      helper = null;
    },
  };
}

module.exports = { createMouse, SCROLL_DOWN_AMOUNT, SCROLL_UP_AMOUNT };
