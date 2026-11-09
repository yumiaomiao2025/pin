import type { BrowserWindow } from 'electron';
import { load } from 'koffi';
import { windowHandle } from './move-window';

const GWL_EXSTYLE = -20;
const WS_EX_TOPMOST = 0x00000008;
const WS_EX_TOOLWINDOW = 0x00000080;
const WS_EX_APPWINDOW = 0x00040000;
const GW_HWNDNEXT = 2;
const GW_HWNDPREV = 3;
const HWND_TOPMOST = -1;
const SWP_NOSIZE = 0x0001;
const SWP_NOMOVE = 0x0002;
const SWP_NOZORDER = 0x0004;
const SWP_NOACTIVATE = 0x0010;
const SWP_FRAMECHANGED = 0x0020;
const SW_SHOWNOACTIVATE = 4;
const KEEP_GEOMETRY = SWP_NOSIZE | SWP_NOMOVE | SWP_NOACTIVATE;

function loadDesktopApi() {
  const user32 = load('user32.dll');
  return {
    foreground: user32.func('__stdcall', 'GetForegroundWindow', 'uintptr_t', []),
    shell: user32.func('__stdcall', 'GetShellWindow', 'uintptr_t', []),
    getClass: user32.func('__stdcall', 'GetClassNameW', 'int', ['uintptr_t', 'void *', 'int']),
    findChild: user32.func('__stdcall', 'FindWindowExW', 'uintptr_t', ['uintptr_t', 'uintptr_t', 'str16', 'void *']),
    getWindow: user32.func('__stdcall', 'GetWindow', 'uintptr_t', ['uintptr_t', 'uint']),
    getStyle: user32.func('__stdcall', 'GetWindowLongW', 'int', ['uintptr_t', 'int']),
    setStyle: user32.func('__stdcall', 'SetWindowLongW', 'int', ['uintptr_t', 'int', 'int']),
    setPosition: user32.func('__stdcall', 'SetWindowPos', 'int', ['uintptr_t', 'intptr_t', 'int', 'int', 'int', 'int', 'uint']),
    showWindow: user32.func('__stdcall', 'ShowWindow', 'int', ['uintptr_t', 'int']),
  };
}

let desktopApi: ReturnType<typeof loadDesktopApi> | undefined;

export function configureDesktopWidget(window: BrowserWindow) {
  const api = desktopApi ??= loadDesktopApi();
  const handle = windowHandle(window);
  const style = api.getStyle(handle, GWL_EXSTYLE);
  api.setStyle(handle, GWL_EXSTYLE, (style | WS_EX_TOOLWINDOW) & ~WS_EX_APPWINDOW);
  api.setPosition(handle, 0, 0, 0, 0, 0, KEEP_GEOMETRY | SWP_NOZORDER | SWP_FRAMECHANGED);
}

export function restoreDesktopWidgets(windows: Iterable<BrowserWindow>) {
  const api = desktopApi ??= loadDesktopApi();
  const foreground = BigInt(api.foreground());
  const shell = BigInt(api.shell());
  // Older Explorer builds host the desktop icons in a separate WorkerW.
  if (!foreground || !shell) return;
  if (foreground !== shell) {
    const className = Buffer.alloc(32);
    const length = api.getClass(foreground, className, 16);
    if (className.toString('utf16le', 0, length * 2) !== 'WorkerW' || !api.findChild(foreground, 0, 'SHELLDLL_DefView', null)) return;
  }

  const belowDesktop = new Set<bigint>();
  for (let handle = BigInt(api.getWindow(foreground, GW_HWNDNEXT)); handle && !belowDesktop.has(handle); handle = BigInt(api.getWindow(handle, GW_HWNDNEXT))) {
    belowDesktop.add(handle);
  }

  for (const window of windows) {
    if (window.isDestroyed() || !window.isVisible()) continue;
    const handle = BigInt(windowHandle(window));
    if (window.isMinimized()) api.showWindow(handle, SW_SHOWNOACTIVATE);
    if (!belowDesktop.has(handle)) continue;

    // Insert above the desktop while leaving any other application windows above it.
    const previous = BigInt(api.getWindow(foreground, GW_HWNDPREV));
    const previousIsTopmost = previous && (api.getStyle(previous, GWL_EXSTYLE) & WS_EX_TOPMOST);
    const insertAfter = window.isAlwaysOnTop() ? HWND_TOPMOST : previousIsTopmost ? 0 : previous;
    api.setPosition(handle, insertAfter, 0, 0, 0, 0, KEEP_GEOMETRY);
  }
}
