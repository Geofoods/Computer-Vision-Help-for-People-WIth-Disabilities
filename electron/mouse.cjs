const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
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

const MAC_HELPER_SOURCE = String.raw`
import Foundation
import CoreGraphics
import AppKit

let source = CGEventSource(stateID: .hidSystemState)
let display = CGMainDisplayID()
let bounds = CGDisplayBounds(display)
let width = max(1.0, bounds.width - 1.0)
let height = max(1.0, bounds.height - 1.0)
var dragging = false
let keyMap: [Int: CGKeyCode] = [
  13: 36, 27: 53, 9: 48, 32: 49, 8: 51, 46: 117, 45: 114, 36: 115, 35: 119,
  33: 116, 34: 121, 37: 123, 38: 126, 39: 124, 40: 125,
  65: 0, 66: 11, 67: 8, 68: 2, 69: 14, 70: 3, 71: 5, 72: 4, 73: 34,
  74: 38, 75: 40, 76: 37, 77: 46, 78: 45, 79: 31, 80: 35, 81: 12,
  82: 15, 83: 1, 84: 17, 85: 32, 86: 9, 87: 13, 88: 7, 89: 16, 90: 6,
  48: 29, 49: 18, 50: 19, 51: 20, 52: 21, 53: 23, 54: 22, 55: 26, 56: 28, 57: 25, 58: 26
]
let modifierMap: [Int: CGKeyCode] = [0x11: 55, 0x12: 58, 0x10: 56, 0x5b: 55]

func point(_ parts: [Substring]) -> CGPoint {
  let x = Double(parts[1]) ?? 0
  let y = Double(parts[2]) ?? 0
  return CGPoint(x: bounds.minX + x * width, y: bounds.minY + y * height)
}

func mouse(_ type: CGEventType, _ button: CGMouseButton, _ p: CGPoint) {
  CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: p, mouseButton: button)?.post(tap: .cghidEventTap)
}

func key(_ code: Int, _ down: Bool, _ flags: CGEventFlags = []) {
  guard let mapped = keyMap[code] ?? modifierMap[code] else { return }
  let event = CGEvent(keyboardEventSource: source, virtualKey: mapped, keyDown: down)
  event?.flags = flags
  event?.post(tap: .cghidEventTap)
}

func modifier(_ code: Int) -> CGEventFlags? {
  switch code {
  case 0x11: return .maskCommand
  case 0x12: return .maskAlternate
  case 0x10: return .maskShift
  case 0x5b: return .maskCommand
  default: return nil
  }
}

while let line = readLine() {
  let parts = line.split(separator: " ")
  guard let command = parts.first else { continue }
  if command == "move" || command == "click" || command == "right-click" || command == "double-click" || command == "mouse-down" || command == "mouse-up" {
    let p = point(parts)
    CGWarpMouseCursorPosition(p)
    if command == "click" { mouse(.leftMouseDown, .left, p); mouse(.leftMouseUp, .left, p) }
    if command == "right-click" { mouse(.rightMouseDown, .right, p); mouse(.rightMouseUp, .right, p) }
    if command == "double-click" {
      mouse(.leftMouseDown, .left, p); mouse(.leftMouseUp, .left, p)
      usleep(32000)
      mouse(.leftMouseDown, .left, p); mouse(.leftMouseUp, .left, p)
    }
    if command == "mouse-down" { dragging = true; mouse(.leftMouseDown, .left, p) }
    if command == "mouse-up" { dragging = false; mouse(.leftMouseUp, .left, p) }
  } else if command == "release" {
    if dragging { dragging = false; mouse(.leftMouseUp, .left, CGPoint(x: 0, y: 0)) }
  } else if command == "scroll", parts.count > 1 {
    let amount = Int32(parts[1]) ?? 0
    CGEvent(scrollWheelEvent2Source: source, units: .pixel, wheelCount: 1, wheel1: amount, wheel2: 0, wheel3: 0)?.post(tap: .cghidEventTap)
  } else if command == "keys", parts.count > 1 {
    let codes = parts[1].split(separator: ",").compactMap { Int($0) }
    var flags = CGEventFlags()
    for code in codes {
      if let value = modifier(code) {
        flags.insert(value)
        key(code, true, flags)
      }
    }
    for code in codes where modifier(code) == nil { key(code, true, flags) }
    for code in codes.reversed() {
      if modifier(code) == nil { key(code, false, flags) }
    }
    for code in codes.reversed() {
      if let value = modifier(code) {
        flags.remove(value)
        key(code, false, flags)
      }
    }
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
  let dragging = false;
  let macHelperPath = null;

  function getMacHelperPath() {
    if (macHelperPath) return macHelperPath;
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'handtap-mac-'));
    macHelperPath = path.join(directory, 'handtap-mouse');
    const sourcePath = path.join(directory, 'handtap-mouse.swift');
    fs.writeFileSync(sourcePath, MAC_HELPER_SOURCE, 'utf8');
    const result = spawnSync('swiftc', ['-O', sourcePath, '-o', macHelperPath], { stdio: 'pipe' });
    if (result.error || result.status !== 0) {
      macHelperPath = null;
      throw new Error(`Could not prepare macOS mouse control. Install Xcode Command Line Tools (${result.error?.message ?? result.stderr?.toString().trim() ?? 'swiftc failed'}).`);
    }
    return macHelperPath;
  }

  function getHelper() {
    if (helper) return helper;
    let child;
    if (process.platform === 'darwin') {
      child = spawnProcess(getMacHelperPath(), [], { stdio: ['pipe', 'ignore', 'ignore'] });
    } else {
      const encoded = Buffer.from(HELPER_SCRIPT, 'utf16le').toString('base64');
      child = spawnProcess(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
        { stdio: ['pipe', 'ignore', 'ignore'], windowsHide: true },
      );
    }
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
    if (process.platform !== 'win32' && process.platform !== 'darwin') {
      throw new Error('Native mouse control is currently supported on Windows and macOS.');
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
      if (helper) {
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
      if (process.platform === 'win32' || process.platform === 'darwin') getHelper();
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
