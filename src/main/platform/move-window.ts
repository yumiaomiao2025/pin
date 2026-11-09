import { type BrowserWindow, screen } from 'electron';
import { load } from 'koffi';

const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;

function loadWindowApi() {
  const user32 = load('user32.dll');
  return {
    setWindowPos: user32.func('__stdcall', 'SetWindowPos', 'int', [
      'uintptr_t', 'void *', 'int', 'int', 'int', 'int', 'uint',
    ]),
    getWindowRect: user32.func('__stdcall', 'GetWindowRect', 'int', ['uintptr_t', 'void *']),
    getDpiForWindow: user32.func('__stdcall', 'GetDpiForWindow', 'uint', ['uintptr_t']),
  };
}

let windowApi: ReturnType<typeof loadWindowApi> | undefined;

export function windowHandle(window: BrowserWindow) {
  const handle = window.getNativeWindowHandle();
  return handle.length === 8 ? handle.readBigUInt64LE() : handle.readUInt32LE();
}

export function moveWindow(window: BrowserWindow, x: number, y: number) {
  if (process.platform !== 'win32') {
    window.setPosition(x, y);
    return;
  }

  // Electron's setPosition reads and reapplies the size. On Windows with
  // fractional DPI, that round trip can grow a frameless window on every move.
  const { setWindowPos } = windowApi ??= loadWindowApi();
  const point = screen.dipToScreenPoint({ x, y });
  if (!setWindowPos(windowHandle(window), null, point.x, point.y, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE)) {
    throw new Error('Windows could not move the Pin window.');
  }
}

export function getWindowPixelSize(window: BrowserWindow) {
  const { getWindowRect, getDpiForWindow } = windowApi ??= loadWindowApi();
  const handle = windowHandle(window);
  const rect = Buffer.alloc(16); // Four signed 32-bit coordinates in a Win32 RECT.
  if (!getWindowRect(handle, rect)) throw new Error('Windows could not read the Pin window size.');
  return {
    width: rect.readInt32LE(8) - rect.readInt32LE(0),
    height: rect.readInt32LE(12) - rect.readInt32LE(4),
    scale: getDpiForWindow(handle) / 96,
  };
}

export function resizeWindowInPixels(window: BrowserWindow, width: number, height: number) {
  const { setWindowPos } = windowApi ??= loadWindowApi();
  if (!setWindowPos(windowHandle(window), null, 0, 0, width, height, SWP_NOMOVE | SWP_NOZORDER | SWP_NOACTIVATE)) {
    throw new Error('Windows could not resize the Pin window.');
  }
}
