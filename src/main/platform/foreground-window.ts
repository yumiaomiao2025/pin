import { type Rectangle } from 'electron';
import { execFile } from 'node:child_process';

type ForegroundWindowInfo = {
  processId: number;
  className: string;
  isShell: boolean;
  isMaximized: boolean;
  windowBounds: Rectangle;
  monitorBounds: Rectangle;
};

const WINDOWS_FOREGROUND_PROBE = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type @'
using System;
using System.Text;
using System.Runtime.InteropServices;

public static class PinWindowProbe {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT {
    public int Left;
    public int Top;
    public int Right;
    public int Bottom;
  }

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct MONITORINFO {
    public int cbSize;
    public RECT rcMonitor;
    public RECT rcWork;
    public uint dwFlags;
  }

  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr hWnd, StringBuilder lpClassName, int nMaxCount);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);
  [DllImport("user32.dll")] public static extern IntPtr MonitorFromWindow(IntPtr hWnd, uint dwFlags);
  [DllImport("user32.dll")] public static extern bool GetMonitorInfo(IntPtr hMonitor, ref MONITORINFO lpmi);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr hWnd);
}
'@

$window = [PinWindowProbe]::GetForegroundWindow()
if ($window -eq [IntPtr]::Zero) { exit 0 }

$windowRect = New-Object PinWindowProbe+RECT
if (-not [PinWindowProbe]::GetWindowRect($window, [ref]$windowRect)) { exit 0 }

$monitor = [PinWindowProbe]::MonitorFromWindow($window, 2)
$monitorInfo = New-Object PinWindowProbe+MONITORINFO
$monitorInfo.cbSize = [Runtime.InteropServices.Marshal]::SizeOf($monitorInfo)
if ($monitor -eq [IntPtr]::Zero -or -not [PinWindowProbe]::GetMonitorInfo($monitor, [ref]$monitorInfo)) { exit 0 }

$classNameBuilder = New-Object Text.StringBuilder 256
[void][PinWindowProbe]::GetClassName($window, $classNameBuilder, $classNameBuilder.Capacity)
$processId = [uint32]0
[void][PinWindowProbe]::GetWindowThreadProcessId($window, [ref]$processId)

[pscustomobject]@{
  processId = [int]$processId
  className = $classNameBuilder.ToString()
  isMaximized = [bool][PinWindowProbe]::IsZoomed($window)
  windowLeft = $windowRect.Left
  windowTop = $windowRect.Top
  windowRight = $windowRect.Right
  windowBottom = $windowRect.Bottom
  monitorLeft = $monitorInfo.rcMonitor.Left
  monitorTop = $monitorInfo.rcMonitor.Top
  monitorRight = $monitorInfo.rcMonitor.Right
  monitorBottom = $monitorInfo.rcMonitor.Bottom
} | ConvertTo-Json -Compress
`;

function parseProbeRectangle(record: Record<string, unknown>, prefix: 'window' | 'monitor') {
  const left = record[`${prefix}Left`];
  const top = record[`${prefix}Top`];
  const right = record[`${prefix}Right`];
  const bottom = record[`${prefix}Bottom`];
  if (
    typeof left !== 'number' ||
    typeof top !== 'number' ||
    typeof right !== 'number' ||
    typeof bottom !== 'number' ||
    ![left, top, right, bottom].every(Number.isFinite) ||
    right <= left ||
    bottom <= top
  ) {
    return undefined;
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function readForegroundWindow(): Promise<ForegroundWindowInfo | undefined> {
  if (process.platform !== 'win32') {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_FOREGROUND_PROBE],
      { windowsHide: true, timeout: 500, maxBuffer: 32 * 1024 },
      (error, stdout) => {
        if (error || !stdout.trim()) {
          resolve(undefined);
          return;
        }
        try {
          const parsed: unknown = JSON.parse(stdout.trim());
          if (!parsed || typeof parsed !== 'object') {
            resolve(undefined);
            return;
          }
          const record = parsed as Record<string, unknown>;
          const processId = record.processId;
          const className = record.className;
          const isMaximized = record.isMaximized;
          const windowBounds = parseProbeRectangle(record, 'window');
          const monitorBounds = parseProbeRectangle(record, 'monitor');
          if (
            typeof processId !== 'number' ||
            !Number.isInteger(processId) ||
            typeof className !== 'string' ||
            typeof isMaximized !== 'boolean' ||
            !windowBounds ||
            !monitorBounds
          ) {
            resolve(undefined);
            return;
          }
          const normalizedClassName = className.toLowerCase();
          resolve({
            processId,
            className: normalizedClassName,
            isShell: ['progman', 'workerw', 'shell_traywnd', 'shell_secondarytraywnd'].includes(
              normalizedClassName,
            ),
            isMaximized,
            windowBounds,
            monitorBounds,
          });
        } catch {
          resolve(undefined);
        }
      },
    );
  });
}

export function isDesktopForeground(info: ForegroundWindowInfo) {
  return info.processId !== process.pid && (info.className === 'progman' || info.className === 'workerw');
}

export function isFullscreenForeground(info: ForegroundWindowInfo) {
  if (info.processId === process.pid || info.isShell || info.isMaximized) {
    return false;
  }
  const tolerance = 4;
  return (
    Math.abs(info.windowBounds.x - info.monitorBounds.x) <= tolerance &&
    Math.abs(info.windowBounds.y - info.monitorBounds.y) <= tolerance &&
    Math.abs(info.windowBounds.width - info.monitorBounds.width) <= tolerance &&
    Math.abs(info.windowBounds.height - info.monitorBounds.height) <= tolerance
  );
}
