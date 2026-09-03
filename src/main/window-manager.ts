import {
  app,
  BrowserWindow,
  clipboard,
  nativeTheme,
  screen,
  type IpcMainInvokeEvent,
  type Rectangle,
} from 'electron';
import { execFile } from 'node:child_process';
import path from 'node:path';

import type { AppDatabaseService } from './database/app-service';
import type { CreateWidgetInput, UpdateClipItemInput, UpdateSettingsInput, UpdateTodoInput } from './database/repositories';
import { DEFAULT_COLORS, type ClipItem, type CustomKit, type DeskTab, type Settings, type Theme, type Todo, type Widget, type WidgetType } from './database/schema';
import type { ColorSet } from '../shared/colors';
import { COLOR_PRESETS, mixColor } from '../shared/colors';

const MIN_WIDTH = 240;
const MIN_HEIGHT = 160;
const COLLAPSED_HEIGHT = 32;
const SNAP_DISTANCE = 12;
const SYSTEM_STATE_POLL_MS = 600;

const DEFAULT_BOUNDS: Record<WidgetType, { width: number; height: number }> = {
  note: { width: 320, height: 230 },
  todo: { width: 320, height: 480 },
  clip: { width: 320, height: 220 },
  desk: { width: 320, height: 480 },
};

type WidgetWindow = BrowserWindow & { __pinWidgetId?: string };
type UtilityWindow = BrowserWindow & { __pinRole?: 'manager' | 'settings' };
type ColorsWindow = BrowserWindow & {
  __pinRole?: 'colors';
  __pinColorsScope?: 'default' | 'widget';
  __pinColorsWidgetId?: string;
};

type AutoHideReason = 'desktop' | 'fullscreen';

type AutoHideState = {
  reasons: Set<AutoHideReason>;
  wasVisible: boolean;
  visibilityVersion: number;
  userOverride: boolean;
};

type ForegroundWindowInfo = {
  processId: number;
  className: string;
  isShell: boolean;
  isMaximized: boolean;
  windowBounds: Rectangle;
  monitorBounds: Rectangle;
};

type SystemVisibilityState = {
  desktopShown: boolean;
  fullscreenDisplays: Array<{ id?: number; bounds: Rectangle }>;
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

function readForegroundWindow(): Promise<ForegroundWindowInfo | undefined> {
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

function rectanglesMatch(left: Rectangle, right: Rectangle, tolerance = 4) {
  return (
    Math.abs(left.x - right.x) <= tolerance &&
    Math.abs(left.y - right.y) <= tolerance &&
    Math.abs(left.width - right.width) <= tolerance &&
    Math.abs(left.height - right.height) <= tolerance
  );
}

function intersectionArea(left: Rectangle, right: Rectangle) {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x));
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y));
  return width * height;
}

function displayForNativeMonitor(bounds: Rectangle) {
  const displays = screen.getAllDisplays();
  const exact = displays.find((display) => rectanglesMatch(display.bounds, bounds));
  if (exact) {
    return exact;
  }
  const monitorCenter = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
  const containing = displays.find(
    (display) =>
      monitorCenter.x >= display.bounds.x &&
      monitorCenter.x <= display.bounds.x + display.bounds.width &&
      monitorCenter.y >= display.bounds.y &&
      monitorCenter.y <= display.bounds.y + display.bounds.height,
  );
  if (containing) {
    return containing;
  }
  return displays
    .map((display) => ({ display, overlap: intersectionArea(display.bounds, bounds) }))
    .sort((left, right) => right.overlap - left.overlap)[0]?.display;
}

function isDesktopForeground(info: ForegroundWindowInfo) {
  return info.processId !== process.pid && (info.className === 'progman' || info.className === 'workerw');
}

function isFullscreenForeground(info: ForegroundWindowInfo) {
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

export interface WindowManager {
  openVisibleWidgets(): void;
  showAllWidgets(): void;
  hideAllWidgets(): void;
  openWidget(widgetId: string): BrowserWindow | undefined;
  openManager(renameWidgetId?: string): BrowserWindow;
  openManagerForRename(event: IpcMainInvokeEvent): boolean;
  hideManager(event: IpcMainInvokeEvent): boolean;
  openSettings(): BrowserWindow;
  hideSettings(event: IpcMainInvokeEvent): boolean;
  openColors(scope: 'default' | 'widget', widgetId?: string): BrowserWindow;
  openWidgetColors(event: IpcMainInvokeEvent): boolean;
  deleteCurrentWidget(event: IpcMainInvokeEvent): Widget | undefined;
  hideColors(event: IpcMainInvokeEvent): boolean;
  createWidget(type: WidgetType): Widget;
  createWidgetForEvent(event: IpcMainInvokeEvent, type: WidgetType): Widget | undefined;
  renameWidget(event: IpcMainInvokeEvent, widgetId: string, title: string): Widget | undefined;
  deleteWidget(event: IpcMainInvokeEvent, widgetId: string): Widget | undefined;
  restoreWidget(event: IpcMainInvokeEvent): Widget | undefined;
  getSettings(): Settings & { effectiveTheme: Theme };
  updateSettings(event: IpcMainInvokeEvent, patch: UpdateSettingsInput): (Settings & { effectiveTheme: Theme }) | undefined;
  resetSettings(event: IpcMainInvokeEvent): (Settings & { effectiveTheme: Theme }) | undefined;
  getColorContext(event: IpcMainInvokeEvent): {
    scope: 'default' | 'widget';
    colors: ColorSet;
    activePresetId: string | null;
    followsDefault?: boolean;
    widgetTitle?: string;
  } | undefined;
  applyDefaultPreset(event: IpcMainInvokeEvent, presetId: string): Settings | undefined;
  applyWidgetPreset(event: IpcMainInvokeEvent, presetId: string): Widget | undefined;
  setWidgetFollowDefault(event: IpcMainInvokeEvent, followsDefault: boolean): Widget | undefined;
  updateColorParts(event: IpcMainInvokeEvent, patch: Partial<ColorSet>): Settings | Widget | undefined;
  applyPrimaryColor(event: IpcMainInvokeEvent, color: string): Settings | Widget | undefined;
  listColorKits(event: IpcMainInvokeEvent): CustomKit[] | undefined;
  createColorKit(event: IpcMainInvokeEvent, name: string): CustomKit | undefined;
  renameColorKit(event: IpcMainInvokeEvent, kitId: string, name: string): CustomKit | undefined;
  deleteColorKit(event: IpcMainInvokeEvent, kitId: string): CustomKit | undefined;
  applyColorKit(event: IpcMainInvokeEvent, kitId: string): Settings | Widget | undefined;
  getWidgetForEvent(event: IpcMainInvokeEvent): Widget | undefined;
  getWidgetsForEvent(event: IpcMainInvokeEvent): Widget[] | undefined;
  setWidgetHidden(event: IpcMainInvokeEvent, widgetId: string, hidden: boolean): Widget | undefined;
  setWidgetPin(event: IpcMainInvokeEvent, widgetId: string, pin: boolean): Widget | undefined;
  setAllWidgetsHidden(event: IpcMainInvokeEvent, hidden: boolean): Widget[] | undefined;
  setActiveTab(event: IpcMainInvokeEvent, activeTab: DeskTab): Widget | undefined;
  getTodosForEvent(event: IpcMainInvokeEvent): Todo[] | undefined;
  createTodo(event: IpcMainInvokeEvent, text: string): Todo | undefined;
  updateTodo(event: IpcMainInvokeEvent, todoId: string, patch: UpdateTodoInput): Todo | undefined;
  deleteTodo(event: IpcMainInvokeEvent, todoId: string): Todo | undefined;
  restoreTodo(event: IpcMainInvokeEvent): Todo | undefined;
  reorderTodos(event: IpcMainInvokeEvent, orderedIds: string[]): Todo[] | undefined;
  getClipsForEvent(event: IpcMainInvokeEvent): ClipItem[] | undefined;
  createClip(event: IpcMainInvokeEvent, text: string): ClipItem | undefined;
  updateClip(event: IpcMainInvokeEvent, clipId: string, patch: UpdateClipItemInput): ClipItem | undefined;
  deleteClip(event: IpcMainInvokeEvent, clipId: string): ClipItem | undefined;
  restoreClip(event: IpcMainInvokeEvent): ClipItem | undefined;
  reorderClips(event: IpcMainInvokeEvent, orderedIds: string[]): ClipItem[] | undefined;
  copyClip(event: IpcMainInvokeEvent, clipId: string): ClipItem | undefined;
  saveNote(event: IpcMainInvokeEvent, noteText: string): Widget | undefined;
  hide(event: IpcMainInvokeEvent): boolean;
  setSize(event: IpcMainInvokeEvent, width: number, height: number): Widget | undefined;
  setOpacity(event: IpcMainInvokeEvent, opacity: number): Widget | undefined;
  setPin(event: IpcMainInvokeEvent, pin: boolean): Widget | undefined;
  setCollapsed(event: IpcMainInvokeEvent, collapsed: boolean): Widget | undefined;
  focusFirstVisible(): void;
  prepareQuit(): void;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function getDisplayForWidget(widget: Widget) {
  const displays = screen.getAllDisplays();
  const matchingDisplay = widget.displayId
    ? displays.find((display) => display.id === widget.displayId)
    : undefined;
  return matchingDisplay ?? screen.getDisplayMatching(widget);
}

function normalizeBounds(widget: Widget): Rectangle {
  const display = getDisplayForWidget(widget);
  const workArea = display.workArea;
  const defaults = DEFAULT_BOUNDS[widget.type];
  const width = clamp(widget.width || defaults.width, MIN_WIDTH, workArea.width);
  const expandedHeight = clamp(widget.height || defaults.height, MIN_HEIGHT, workArea.height);
  const height = widget.collapsed ? COLLAPSED_HEIGHT : expandedHeight;

  return {
    width,
    height,
    x: clamp(widget.x, workArea.x, workArea.x + workArea.width - width),
    y: clamp(widget.y, workArea.y, workArea.y + workArea.height - height),
  };
}

function snapBounds(bounds: Rectangle): Rectangle {
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;
  const right = workArea.x + workArea.width - bounds.width;
  const bottom = workArea.y + workArea.height - bounds.height;
  const x =
    Math.abs(bounds.x - workArea.x) <= SNAP_DISTANCE
      ? workArea.x
      : Math.abs(bounds.x - right) <= SNAP_DISTANCE
        ? right
        : bounds.x;
  const y =
    Math.abs(bounds.y - workArea.y) <= SNAP_DISTANCE
      ? workArea.y
      : Math.abs(bounds.y - bottom) <= SNAP_DISTANCE
        ? bottom
        : bounds.y;

  return { ...bounds, x, y };
}

function isWidgetWindow(window: BrowserWindow): window is WidgetWindow {
  return Boolean((window as WidgetWindow).__pinWidgetId);
}

function isManagerWindow(window: BrowserWindow): window is UtilityWindow {
  return (window as UtilityWindow).__pinRole === 'manager';
}

function isSettingsWindow(window: BrowserWindow): window is UtilityWindow {
  return (window as UtilityWindow).__pinRole === 'settings';
}

function isColorsWindow(window: BrowserWindow): window is ColorsWindow {
  return (window as ColorsWindow).__pinRole === 'colors';
}

function settingsToColors(settings: Settings): ColorSet {
  return {
    paper: settings.defaultPaperColor,
    ink: settings.defaultInkColor,
    title: settings.defaultTitleColor,
    accent: settings.defaultAccentColor,
    spine: settings.defaultSpineColor,
    shadow: settings.defaultShadowColor,
  };
}

function colorsToSettings(colors: ColorSet) {
  return {
    defaultPaperColor: colors.paper,
    defaultInkColor: colors.ink,
    defaultTitleColor: colors.title,
    defaultAccentColor: colors.accent,
    defaultSpineColor: colors.spine,
    defaultShadowColor: colors.shadow,
  };
}

function colorsToWidgetPatch(colors: ColorSet) {
  return {
    paperColor: colors.paper,
    inkColor: colors.ink,
    titleColor: colors.title,
    accentColor: colors.accent,
    spineColor: colors.spine,
    shadowColor: colors.shadow,
  };
}

function widgetToColors(widget: Widget): ColorSet {
  return {
    paper: widget.paperColor,
    ink: widget.inkColor,
    title: widget.titleColor,
    accent: widget.accentColor,
    spine: widget.spineColor,
    shadow: widget.shadowColor,
  };
}

function kitToColors(kit: CustomKit): ColorSet {
  return {
    paper: kit.paper,
    ink: kit.ink,
    title: kit.title,
    accent: kit.accent,
    spine: kit.spine,
    shadow: kit.shadow,
  };
}

function colorsEqual(left: ColorSet, right: ColorSet) {
  return (
    left.paper === right.paper &&
    left.ink === right.ink &&
    left.title === right.title &&
    left.accent === right.accent &&
    left.spine === right.spine &&
    left.shadow === right.shadow
  );
}

function isHexColor(value: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function settingsForRenderer(settings: Settings): Settings & { effectiveTheme: Theme } {
  return {
    ...settings,
    effectiveTheme: settings.autoTheme
      ? nativeTheme.shouldUseDarkColors
        ? 'dark'
        : 'light'
      : settings.theme,
  };
}

export function createWindowManager(service: AppDatabaseService): WindowManager {
  const windows = new Map<string, WidgetWindow>();
  let managerWindow: UtilityWindow | undefined;
  let settingsWindow: UtilityWindow | undefined;
  let colorsWindow: ColorsWindow | undefined;
  const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let contentTrash:
    | { kind: 'todo'; widgetId: string; item: Todo; timer: ReturnType<typeof setTimeout> }
    | { kind: 'clip'; widgetId: string; item: ClipItem; timer: ReturnType<typeof setTimeout> }
    | { kind: 'widget'; item: Widget; todos: Todo[]; clips: ClipItem[]; timer: ReturnType<typeof setTimeout> }
    | undefined;
  let quitting = false;
  const autoHideStates = new Map<string, AutoHideState>();
  const visibilityVersions = new Map<string, number>();
  let systemStatePollTimer: ReturnType<typeof setInterval> | undefined;
  let systemStatePollInFlight = false;
  let currentSystemVisibility: SystemVisibilityState = {
    desktopShown: false,
    fullscreenDisplays: [],
  };

  const widgetIdForEvent = (event: IpcMainInvokeEvent) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (!senderWindow || !isWidgetWindow(senderWindow)) {
      return undefined;
    }
    return senderWindow.__pinWidgetId;
  };

  const isManagerEvent = (event: IpcMainInvokeEvent) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    return Boolean(senderWindow && isManagerWindow(senderWindow));
  };

  const isSettingsEvent = (event: IpcMainInvokeEvent) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    return Boolean(senderWindow && isSettingsWindow(senderWindow));
  };

  const colorsScopeForEvent = (event: IpcMainInvokeEvent) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (!senderWindow || !isColorsWindow(senderWindow)) {
      return undefined;
    }
    return {
      scope: senderWindow.__pinColorsScope,
      widgetId: senderWindow.__pinColorsWidgetId,
    };
  };

  const broadcastSettings = (settings: Settings) => {
    const rendererSettings = settingsForRenderer(settings);
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send('settings:changed', rendererSettings);
      }
    });
  };

  const handleNativeThemeUpdated = () => {
    broadcastSettings(service.settings.ensure());
  };
  nativeTheme.on('updated', handleNativeThemeUpdated);

  const broadcastWidget = (widget: Widget) => {
    const recipients = [windows.get(widget.id), managerWindow, colorsWindow];
    const sent = new Set<BrowserWindow>();
    recipients.forEach((targetWindow) => {
      if (targetWindow && !targetWindow.isDestroyed() && !sent.has(targetWindow)) {
        sent.add(targetWindow);
        targetWindow.webContents.send('widget:changed', widget);
      }
    });
  };

  const broadcastWidgetDeleted = (widgetId: string) => {
    const recipients = [managerWindow, colorsWindow];
    recipients.forEach((targetWindow) => {
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('widget:deleted', widgetId);
      }
    });
  };

  const syncDefaultColors = (settings: Settings) => {
    const colors = settingsToColors(settings);
    service.widgets.list().filter((widget) => widget.followsDefault).forEach((widget) => {
      const updated = service.widgets.update(widget.id, colorsToWidgetPatch(colors));
      if (updated) {
        broadcastWidget(updated);
      }
    });
  };

  const applyGlobalWindowSettings = (settings: Settings) => {
    windows.forEach((window, widgetId) => {
      if (window.isDestroyed()) {
        return;
      }
      const widget = service.widgets.getById(widgetId);
      window.setAlwaysOnTop(Boolean(widget?.pin || settings.pinAll));
    });
  };

  const updateGlobalSettings = (patch: UpdateSettingsInput) => {
    const updated = service.settings.update(patch);
    if (patch.autostart !== undefined && process.platform !== 'linux') {
      app.setLoginItemSettings({ openAtLogin: updated.autostart });
    }
    if (
      patch.defaultPaperColor !== undefined ||
      patch.defaultInkColor !== undefined ||
      patch.defaultTitleColor !== undefined ||
      patch.defaultAccentColor !== undefined ||
      patch.defaultSpineColor !== undefined ||
      patch.defaultShadowColor !== undefined
    ) {
      syncDefaultColors(updated);
    }
    applyGlobalWindowSettings(updated);
    broadcastSettings(updated);
    return updated;
  };

  const isAutoHidden = (widgetId: string) => {
    const state = autoHideStates.get(widgetId);
    return Boolean(state && state.reasons.size > 0 && !state.userOverride);
  };

  const todoForEvent = (event: IpcMainInvokeEvent, todoId: string) => {
    const widgetId = widgetIdForEvent(event);
    if (!widgetId) {
      return undefined;
    }
    const todo = service.todos.getById(todoId);
    return todo?.widgetId === widgetId ? todo : undefined;
  };

  const clipForEvent = (event: IpcMainInvokeEvent, clipId: string) => {
    const widgetId = widgetIdForEvent(event);
    if (!widgetId) {
      return undefined;
    }
    const clip = service.clipItems.getById(clipId);
    return clip?.widgetId === widgetId ? clip : undefined;
  };

  const persistBounds = (widgetId: string, window: WidgetWindow, bounds: Rectangle) => {
    const widget = service.widgets.getById(widgetId);
    if (!widget) {
      return;
    }
    const display = screen.getDisplayMatching(bounds);
    service.widgets.update(widgetId, {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: widget.collapsed ? widget.height : bounds.height,
      displayId: display.id,
    });
    if (window.isDestroyed()) {
      windows.delete(widgetId);
    }
  };

  const schedulePersistBounds = (widgetId: string, window: WidgetWindow, bounds: Rectangle) => {
    const previousTimer = persistTimers.get(widgetId);
    if (previousTimer) {
      clearTimeout(previousTimer);
    }
    persistTimers.set(
      widgetId,
      setTimeout(() => {
        persistTimers.delete(widgetId);
        persistBounds(widgetId, window, bounds);
      }, 100),
    );
  };

  const loadWidget = (window: WidgetWindow, widgetId: string) => {
    const query = { role: 'widget', id: widgetId };
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      void window.loadURL(
        `${MAIN_WINDOW_VITE_DEV_SERVER_URL}?${new URLSearchParams(query).toString()}`,
      );
    } else {
      void window.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
        { query },
      );
    }
  };

  const loadManager = (window: UtilityWindow, renameWidgetId?: string) => {
    const query: Record<string, string> = { role: 'manager', id: 'manager' };
    if (renameWidgetId) {
      query.renameId = renameWidgetId;
    }
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      void window.loadURL(
        `${MAIN_WINDOW_VITE_DEV_SERVER_URL}?${new URLSearchParams(query).toString()}`,
      );
    } else {
      void window.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
        { query },
      );
    }
  };

  const loadSettings = (window: UtilityWindow) => {
    const query = { role: 'settings', id: 'settings' };
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      void window.loadURL(
        `${MAIN_WINDOW_VITE_DEV_SERVER_URL}?${new URLSearchParams(query).toString()}`,
      );
    } else {
      void window.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
        { query },
      );
    }
  };

  const loadColors = (window: ColorsWindow) => {
    const query: Record<string, string> = {
      role: 'colors',
      id: 'colors',
      scope: window.__pinColorsScope ?? 'default',
    };
    if (window.__pinColorsWidgetId) {
      query.widgetId = window.__pinColorsWidgetId;
    }
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      void window.loadURL(
        `${MAIN_WINDOW_VITE_DEV_SERVER_URL}?${new URLSearchParams(query).toString()}`,
      );
    } else {
      void window.loadFile(
        path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
        { query },
      );
    }
  };

  const openWidget = (widgetId: string) => {
    const existingWindow = windows.get(widgetId);
    if (existingWindow && !existingWindow.isDestroyed()) {
      const existingWidget = service.widgets.getById(widgetId);
      if (existingWidget) {
        const recoveredBounds = normalizeBounds(existingWidget);
        existingWindow.setBounds(recoveredBounds);
        persistBounds(widgetId, existingWindow, recoveredBounds);
      }
      if (isAutoHidden(widgetId)) {
        return existingWindow;
      }
      existingWindow.show();
      existingWindow.focus();
      service.widgets.update(widgetId, { hidden: false });
      return existingWindow;
    }

    const widget = service.widgets.getById(widgetId);
    if (!widget) {
      return undefined;
    }

    const bounds = normalizeBounds(widget);
    const window = new BrowserWindow({
      ...bounds,
      minWidth: MIN_WIDTH,
      minHeight: MIN_HEIGHT,
      frame: false,
      show: false,
      resizable: !widget.collapsed,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    }) as WidgetWindow;
    window.__pinWidgetId = widgetId;
    windows.set(widgetId, window);
    window.setOpacity(widget.opacity / 100);
    window.setAlwaysOnTop(Boolean(widget.pin || service.settings.ensure().pinAll));

    let snapping = false;
    window.on('move', () => {
      if (snapping || window.isDestroyed()) {
        return;
      }
      const currentBounds = window.getBounds();
      const nextBounds = service.settings.ensure().snap ? snapBounds(currentBounds) : currentBounds;
      if (nextBounds.x !== currentBounds.x || nextBounds.y !== currentBounds.y) {
        snapping = true;
        window.setPosition(nextBounds.x, nextBounds.y);
        snapping = false;
      }
      schedulePersistBounds(widgetId, window, nextBounds);
    });
    window.on('resize', () => {
      if (!window.isDestroyed()) {
        schedulePersistBounds(widgetId, window, window.getBounds());
      }
    });
    window.on('close', (event) => {
      if (!quitting) {
        event.preventDefault();
        markUserVisibility(widgetId, true);
      }
    });
    window.on('closed', () => {
      windows.delete(widgetId);
    });
    window.once('ready-to-show', () => {
      if (!widget.hidden && !isAutoHidden(widgetId) && !window.isDestroyed()) {
        window.show();
      }
    });

    loadWidget(window, widgetId);
    if (widget.hidden) {
      return window;
    }
    return window;
  };

  const markUserVisibility = (widgetId: string, hidden: boolean) => {
    const visibilityVersion = (visibilityVersions.get(widgetId) ?? 0) + 1;
    visibilityVersions.set(widgetId, visibilityVersion);
    const autoHideState = autoHideStates.get(widgetId);
    if (autoHideState) {
      autoHideState.userOverride = true;
    } else {
      const widget = service.widgets.getById(widgetId);
      const targetWindow = windows.get(widgetId);
      const reasons = widget ? reasonsForWidget(widget, targetWindow) : new Set<AutoHideReason>();
      if (reasons.size > 0) {
        autoHideStates.set(widgetId, {
          reasons,
          wasVisible: false,
          visibilityVersion,
          userOverride: true,
        });
      }
    }
    const targetWindow = windows.get(widgetId);
    if (hidden) {
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.hide();
      }
      return service.widgets.update(widgetId, { hidden: true });
    }
    service.widgets.update(widgetId, { hidden: false });
    openWidget(widgetId);
    return service.widgets.getById(widgetId);
  };

  function widgetIsOnFullscreenDisplay(
    widget: Widget,
    targetWindow: WidgetWindow,
    fullscreenDisplay: { id?: number; bounds: Rectangle },
  ) {
    const display = screen.getDisplayMatching(targetWindow.getBounds());
    if (fullscreenDisplay.id !== undefined && display.id === fullscreenDisplay.id) {
      return true;
    }
    if (rectanglesMatch(display.bounds, fullscreenDisplay.bounds)) {
      return true;
    }
    const bounds = targetWindow.getBounds();
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const nativeBounds = fullscreenDisplay.bounds;
    if (
      center.x >= nativeBounds.x &&
      center.x <= nativeBounds.x + nativeBounds.width &&
      center.y >= nativeBounds.y &&
      center.y <= nativeBounds.y + nativeBounds.height
    ) {
      return true;
    }
    return widget.displayId !== null && widget.displayId === fullscreenDisplay.id;
  }

  function reasonsForWidget(
    widget: Widget,
    targetWindow: WidgetWindow | undefined,
    systemState = currentSystemVisibility,
  ) {
    const reasons = new Set<AutoHideReason>();
    if (systemState.desktopShown && widget.pin) {
      reasons.add('desktop');
    }
    if (systemState.fullscreenDisplays.some((display) => {
      if (targetWindow && !targetWindow.isDestroyed()) {
        return widgetIsOnFullscreenDisplay(widget, targetWindow, display);
      }
      return widget.displayId !== null && widget.displayId === display.id;
    })) {
      reasons.add('fullscreen');
    }
    return reasons;
  }

  const applySystemVisibility = (systemState: SystemVisibilityState) => {
    const widgets = service.widgets.list();
    const widgetIds = new Set(widgets.map((widget) => widget.id));
    autoHideStates.forEach((_state, widgetId) => {
      if (!widgetIds.has(widgetId)) {
        autoHideStates.delete(widgetId);
        visibilityVersions.delete(widgetId);
      }
    });

    widgets.forEach((widget) => {
      const targetWindow = windows.get(widget.id);
      const reasons = reasonsForWidget(widget, targetWindow, systemState);

      const currentState = autoHideStates.get(widget.id);
      if (reasons.size === 0) {
        if (!currentState) {
          return;
        }
        autoHideStates.delete(widget.id);
        const currentWindow = windows.get(widget.id);
        if (
          !currentState.userOverride &&
          currentState.wasVisible &&
          visibilityVersions.get(widget.id) === currentState.visibilityVersion &&
          !widget.hidden &&
          currentWindow &&
          !currentWindow.isDestroyed()
        ) {
          currentWindow.show();
        }
        return;
      }

      if (currentState) {
        currentState.reasons = reasons;
        if (
          !currentState.userOverride &&
          !widget.hidden &&
          targetWindow &&
          !targetWindow.isDestroyed() &&
          targetWindow.isVisible()
        ) {
          targetWindow.hide();
        }
        return;
      }

      if (
        widget.hidden ||
        !targetWindow ||
        targetWindow.isDestroyed() ||
        !targetWindow.isVisible()
      ) {
        return;
      }
      autoHideStates.set(widget.id, {
        reasons,
        wasVisible: true,
        visibilityVersion: visibilityVersions.get(widget.id) ?? 0,
        userOverride: false,
      });
      targetWindow.hide();
    });
  };

  const pollSystemVisibility = async () => {
    if (quitting || systemStatePollInFlight) {
      return;
    }
    systemStatePollInFlight = true;
    try {
      const foregroundWindow = await readForegroundWindow();
      if (quitting) {
        return;
      }
      const fullscreenDisplays: SystemVisibilityState['fullscreenDisplays'] = [];
      if (foregroundWindow && isFullscreenForeground(foregroundWindow)) {
        const display = displayForNativeMonitor(foregroundWindow.monitorBounds);
        fullscreenDisplays.push({
          id: display?.id,
          bounds: foregroundWindow.monitorBounds,
        });
      }
      const nextSystemVisibility: SystemVisibilityState = {
        desktopShown: Boolean(foregroundWindow && isDesktopForeground(foregroundWindow)),
        fullscreenDisplays,
      };
      currentSystemVisibility = nextSystemVisibility;
      applySystemVisibility(nextSystemVisibility);
    } finally {
      systemStatePollInFlight = false;
    }
  };

  const openManager = (renameWidgetId?: string) => {
    if (managerWindow && !managerWindow.isDestroyed()) {
      if (renameWidgetId) {
        loadManager(managerWindow, renameWidgetId);
      }
      managerWindow.show();
      managerWindow.focus();
      return managerWindow;
    }

    managerWindow = new BrowserWindow({
      width: 320,
      height: 480,
      minWidth: 240,
      minHeight: 160,
      frame: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    }) as UtilityWindow;
    managerWindow.__pinRole = 'manager';
    managerWindow.on('close', (event) => {
      if (!quitting) {
        event.preventDefault();
        managerWindow?.hide();
      }
    });
    managerWindow.once('closed', () => {
      managerWindow = undefined;
    });
    managerWindow.once('ready-to-show', () => {
      if (!quitting && managerWindow && !managerWindow.isDestroyed()) {
        managerWindow.show();
      }
    });
    loadManager(managerWindow, renameWidgetId);
    return managerWindow;
  };

  const openSettings = () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.show();
      settingsWindow.focus();
      return settingsWindow;
    }

    settingsWindow = new BrowserWindow({
      width: 320,
      height: 480,
      minWidth: 240,
      minHeight: 160,
      frame: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    }) as UtilityWindow;
    settingsWindow.__pinRole = 'settings';
    settingsWindow.on('close', (event) => {
      if (!quitting) {
        event.preventDefault();
        settingsWindow?.hide();
      }
    });
    settingsWindow.once('closed', () => {
      settingsWindow = undefined;
    });
    settingsWindow.once('ready-to-show', () => {
      if (!quitting && settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.show();
      }
    });
    loadSettings(settingsWindow);
    return settingsWindow;
  };

  const openColors = (scope: 'default' | 'widget', widgetId?: string) => {
    if (scope === 'widget' && (!widgetId || !service.widgets.getById(widgetId))) {
      return openColors('default');
    }
    if (colorsWindow && !colorsWindow.isDestroyed()) {
      colorsWindow.__pinColorsScope = scope;
      colorsWindow.__pinColorsWidgetId = widgetId;
      loadColors(colorsWindow);
      colorsWindow.show();
      colorsWindow.focus();
      return colorsWindow;
    }

    colorsWindow = new BrowserWindow({
      width: 320,
      height: 480,
      minWidth: 240,
      minHeight: 160,
      frame: false,
      show: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
      },
    }) as ColorsWindow;
    colorsWindow.__pinRole = 'colors';
    colorsWindow.__pinColorsScope = scope;
    colorsWindow.__pinColorsWidgetId = widgetId;
    colorsWindow.on('close', (event) => {
      if (!quitting) {
        event.preventDefault();
        colorsWindow?.hide();
      }
    });
    colorsWindow.once('closed', () => {
      colorsWindow = undefined;
    });
    colorsWindow.once('ready-to-show', () => {
      if (!quitting && colorsWindow && !colorsWindow.isDestroyed()) {
        colorsWindow.show();
      }
    });
    loadColors(colorsWindow);
    return colorsWindow;
  };

  const showWidgetForEvent = (event: IpcMainInvokeEvent) => {
    const widgetId = widgetIdForEvent(event);
    if (!widgetId) {
      return undefined;
    }
    return { widgetId, window: windows.get(widgetId) };
  };

  const updateColorParts = (event: IpcMainInvokeEvent, patch: Partial<ColorSet>) => {
    const context = colorsScopeForEvent(event);
    if (context?.scope !== 'default' && context?.scope !== 'widget') {
      return undefined;
    }
    const normalized = Object.fromEntries(
      Object.entries(patch).map(([key, value]) => [
        key,
        typeof value === 'string' ? value.toUpperCase() : value,
      ]),
    ) as Partial<ColorSet>;
    if (context.scope === 'default') {
      return updateGlobalSettings({
        ...(normalized.paper !== undefined ? { defaultPaperColor: normalized.paper } : {}),
        ...(normalized.ink !== undefined ? { defaultInkColor: normalized.ink } : {}),
        ...(normalized.title !== undefined ? { defaultTitleColor: normalized.title } : {}),
        ...(normalized.accent !== undefined ? { defaultAccentColor: normalized.accent } : {}),
        ...(normalized.spine !== undefined ? { defaultSpineColor: normalized.spine } : {}),
        ...(normalized.shadow !== undefined ? { defaultShadowColor: normalized.shadow } : {}),
      });
    }
    if (!context.widgetId) {
      return undefined;
    }
    const updated = service.widgets.update(context.widgetId, {
      ...(normalized.paper !== undefined ? { paperColor: normalized.paper } : {}),
      ...(normalized.ink !== undefined ? { inkColor: normalized.ink } : {}),
      ...(normalized.title !== undefined ? { titleColor: normalized.title } : {}),
      ...(normalized.accent !== undefined ? { accentColor: normalized.accent } : {}),
      ...(normalized.spine !== undefined ? { spineColor: normalized.spine } : {}),
      ...(normalized.shadow !== undefined ? { shadowColor: normalized.shadow } : {}),
      followsDefault: false,
    });
    if (updated) {
      broadcastWidget(updated);
    }
    return updated;
  };

  const applyPrimaryColor = (event: IpcMainInvokeEvent, color: string) => {
    if (!isHexColor(color)) {
      return undefined;
    }
    return updateColorParts(event, {
      paper: mixColor(color, '#FFFFFF', 0.88),
      title: color,
      accent: color,
      spine: color,
      shadow: color,
    });
  };

  const deleteWidgetById = (widgetId: string) => {
    const widget = service.widgets.getById(widgetId);
    if (!widget) {
      return undefined;
    }

    if (contentTrash) {
      clearTimeout(contentTrash.timer);
    }
    const persistTimer = persistTimers.get(widgetId);
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimers.delete(widgetId);
    }

    const todos = service.todos.listByWidget(widgetId);
    const clips = service.clipItems.listByWidget(widgetId);
    const targetWindow = windows.get(widgetId);
    if (targetWindow && !targetWindow.isDestroyed()) {
      targetWindow.destroy();
    }
    windows.delete(widgetId);
    service.widgets.delete(widgetId);
    broadcastWidgetDeleted(widgetId);

    const timer = setTimeout(() => {
      if (contentTrash?.kind === 'widget' && contentTrash.item.id === widget.id) {
        contentTrash = undefined;
      }
    }, 5_000);
    contentTrash = { kind: 'widget', item: widget, todos, clips, timer };
    return widget;
  };

  if (process.platform === 'win32') {
    void pollSystemVisibility();
    systemStatePollTimer = setInterval(() => {
      void pollSystemVisibility();
    }, SYSTEM_STATE_POLL_MS);
  }

  return {
    openVisibleWidgets: () => {
      service.widgets.list().filter((widget) => !widget.hidden).forEach((widget) => {
        openWidget(widget.id);
      });
    },

    showAllWidgets: () => {
      service.widgets.list().forEach((widget) => {
        markUserVisibility(widget.id, false);
      });
    },

    hideAllWidgets: () => {
      service.widgets.list().forEach((widget) => {
        markUserVisibility(widget.id, true);
      });
    },

    openWidget,

    openManager,

    openManagerForRename: (event) => {
      const widgetId = widgetIdForEvent(event);
      if (!widgetId || !service.widgets.getById(widgetId)) {
        return false;
      }
      openManager(widgetId);
      return true;
    },

    hideManager: (event) => {
      if (!isManagerEvent(event) || !managerWindow || managerWindow.isDestroyed()) {
        return false;
      }
      managerWindow.hide();
      return true;
    },

    openSettings,

    hideSettings: (event) => {
      if (!isSettingsEvent(event) || !settingsWindow || settingsWindow.isDestroyed()) {
        return false;
      }
      settingsWindow.hide();
      return true;
    },

    openColors,

    openWidgetColors: (event) => {
      const widgetId = widgetIdForEvent(event);
      if (!widgetId || !service.widgets.getById(widgetId)) {
        return false;
      }
      openColors('widget', widgetId);
      return true;
    },

    hideColors: (event) => {
      if (!colorsScopeForEvent(event) || !colorsWindow || colorsWindow.isDestroyed()) {
        return false;
      }
      colorsWindow.hide();
      return true;
    },

    createWidget: (type) => {
      const defaults = DEFAULT_BOUNDS[type];
      const defaultColors = settingsToColors(service.settings.ensure());
      const input: CreateWidgetInput = {
        type,
        width: defaults.width,
        height: defaults.height,
        opacity: service.settings.ensure().defaultOpacity,
        x: screen.getPrimaryDisplay().workArea.x + 32,
        y: screen.getPrimaryDisplay().workArea.y + 32,
        hidden: false,
        ...colorsToWidgetPatch(defaultColors),
        followsDefault: true,
      };
      const widget = service.widgets.create(input);
      openWidget(widget.id);
      return widget;
    },

    createWidgetForEvent: (event, type) => {
      if (!isManagerEvent(event)) {
        return undefined;
      }
      const defaultColors = settingsToColors(service.settings.ensure());
      const widget = service.widgets.create({
        type,
        width: DEFAULT_BOUNDS[type].width,
        height: DEFAULT_BOUNDS[type].height,
        opacity: service.settings.ensure().defaultOpacity,
        x: screen.getPrimaryDisplay().workArea.x + 32,
        y: screen.getPrimaryDisplay().workArea.y + 32,
        hidden: false,
        ...colorsToWidgetPatch(defaultColors),
        followsDefault: true,
      });
      openWidget(widget.id);
      return widget;
    },

    renameWidget: (event, widgetId, title) => {
      if (!isManagerEvent(event)) {
        return undefined;
      }
      const widget = service.widgets.getById(widgetId);
      if (!widget) {
        return undefined;
      }
      const normalizedTitle = title.trim();
      if (!normalizedTitle) {
        return widget;
      }
      return service.widgets.update(widgetId, { title: normalizedTitle });
    },

    deleteWidget: (event, widgetId) => {
      if (!isManagerEvent(event)) {
        return undefined;
      }
      return deleteWidgetById(widgetId);
    },

    deleteCurrentWidget: (event) => {
      const widgetId = widgetIdForEvent(event);
      return widgetId ? deleteWidgetById(widgetId) : undefined;
    },

    restoreWidget: (event) => {
      if (!isManagerEvent(event) || !contentTrash || contentTrash.kind !== 'widget') {
        return undefined;
      }
      const { item: widget, todos, clips, timer } = contentTrash;
      clearTimeout(timer);
      contentTrash = undefined;
      service.transaction(({ widgets, todos: todoRepository, clipItems }) => {
        widgets.create(widget);
        todos.forEach((todo) => todoRepository.create(todo));
        clips.forEach((clip) => clipItems.create(clip));
      });
      openWidget(widget.id);
      return service.widgets.getById(widget.id);
    },

    getSettings: () => settingsForRenderer(service.settings.ensure()),

    updateSettings: (event, patch) => {
      if (!isSettingsEvent(event)) {
        return undefined;
      }
      return settingsForRenderer(updateGlobalSettings(patch));
    },

    resetSettings: (event) => {
      if (!isSettingsEvent(event)) {
        return undefined;
      }
      return settingsForRenderer(updateGlobalSettings({
        theme: 'light',
        autoTheme: false,
        defaultPaperColor: DEFAULT_COLORS.paper,
        defaultInkColor: DEFAULT_COLORS.ink,
        defaultTitleColor: DEFAULT_COLORS.title,
        defaultAccentColor: DEFAULT_COLORS.accent,
        defaultSpineColor: DEFAULT_COLORS.spine,
        defaultShadowColor: DEFAULT_COLORS.shadow,
        scrollbar: 'overlay',
        maxLines: 0,
        hoverFull: true,
        opacityBar: true,
        defaultOpacity: 100,
        pinAll: false,
        autostart: false,
        snap: true,
      }));
    },

    getColorContext: (event) => {
      const context = colorsScopeForEvent(event);
      if (!context || (context.scope !== 'default' && context.scope !== 'widget')) {
        return undefined;
      }
      if (context.scope === 'widget') {
        if (!context.widgetId) {
          return undefined;
        }
        const widget = service.widgets.getById(context.widgetId);
        if (!widget) {
          return undefined;
        }
        const colors = widgetToColors(widget);
        const activePresetId = COLOR_PRESETS.find((preset) => colorsEqual(preset, colors))?.id ?? null;
        return {
          scope: 'widget' as const,
          colors,
          activePresetId,
          followsDefault: widget.followsDefault,
          widgetTitle: widget.title.trim() || widget.type.toUpperCase(),
        };
      }
      const colors = settingsToColors(service.settings.ensure());
      const activePresetId = COLOR_PRESETS.find((preset) => colorsEqual(preset, colors))?.id ?? null;
      return { scope: 'default' as const, colors, activePresetId };
    },

    applyDefaultPreset: (event, presetId) => {
      if (colorsScopeForEvent(event)?.scope !== 'default') {
        return undefined;
      }
      const preset = COLOR_PRESETS.find((candidate) => candidate.id === presetId);
      if (!preset) {
        return undefined;
      }
      return updateGlobalSettings(colorsToSettings(preset));
    },

    applyWidgetPreset: (event, presetId) => {
      const context = colorsScopeForEvent(event);
      if (context?.scope !== 'widget' || !context.widgetId) {
        return undefined;
      }
      const preset = COLOR_PRESETS.find((candidate) => candidate.id === presetId);
      if (!preset) {
        return undefined;
      }
      const updated = service.widgets.update(context.widgetId, {
        ...colorsToWidgetPatch(preset),
        followsDefault: false,
      });
      if (updated) {
        broadcastWidget(updated);
      }
      return updated;
    },

    setWidgetFollowDefault: (event, followsDefault) => {
      const context = colorsScopeForEvent(event);
      if (context?.scope !== 'widget' || !context.widgetId) {
        return undefined;
      }
      const patch = followsDefault
        ? { ...colorsToWidgetPatch(settingsToColors(service.settings.ensure())), followsDefault: true }
        : { followsDefault: false };
      const updated = service.widgets.update(context.widgetId, patch);
      if (updated) {
        broadcastWidget(updated);
      }
      return updated;
    },

    updateColorParts,

    applyPrimaryColor,

    listColorKits: (event) => {
      const context = colorsScopeForEvent(event);
      return context?.scope === 'default' || context?.scope === 'widget'
        ? service.customKits.list()
        : undefined;
    },

    createColorKit: (event, name) => {
      const context = colorsScopeForEvent(event);
      if (context?.scope !== 'default' && context?.scope !== 'widget') {
        return undefined;
      }
      const normalizedName = name.trim();
      if (!normalizedName) {
        return undefined;
      }
      let colors: ColorSet;
      if (context.scope === 'default') {
        colors = settingsToColors(service.settings.ensure());
      } else if (context.widgetId) {
        const widget = service.widgets.getById(context.widgetId);
        if (!widget) {
          return undefined;
        }
        colors = widgetToColors(widget);
      } else {
        return undefined;
      }
      return service.customKits.create({
        name: normalizedName,
        paper: colors.paper,
        ink: colors.ink,
        title: colors.title,
        accent: colors.accent,
        spine: colors.spine,
        shadow: colors.shadow,
      });
    },

    renameColorKit: (event, kitId, name) => {
      const context = colorsScopeForEvent(event);
      if ((context?.scope !== 'default' && context?.scope !== 'widget') || !name.trim()) {
        return undefined;
      }
      return service.customKits.update(kitId, { name: name.trim() });
    },

    deleteColorKit: (event, kitId) => {
      const context = colorsScopeForEvent(event);
      if (context?.scope !== 'default' && context?.scope !== 'widget') {
        return undefined;
      }
      const kit = service.customKits.getById(kitId);
      if (!kit || !service.customKits.delete(kitId)) {
        return undefined;
      }
      return kit;
    },

    applyColorKit: (event, kitId) => {
      const context = colorsScopeForEvent(event);
      if (context?.scope !== 'default' && context?.scope !== 'widget') {
        return undefined;
      }
      const kit = service.customKits.getById(kitId);
      if (!kit) {
        return undefined;
      }
      const colors = kitToColors(kit);
      if (context.scope === 'default') {
        return updateGlobalSettings(colorsToSettings(colors));
      }
      if (!context.widgetId) {
        return undefined;
      }
      const updated = service.widgets.update(context.widgetId, {
        ...colorsToWidgetPatch(colors),
        followsDefault: false,
      });
      if (updated) {
        broadcastWidget(updated);
      }
      return updated;
    },

    getWidgetForEvent: (event) => {
      const widgetId = widgetIdForEvent(event);
      return widgetId ? service.widgets.getById(widgetId) : undefined;
    },

    getWidgetsForEvent: (event) => (isManagerEvent(event) ? service.widgets.list() : undefined),

    setWidgetHidden: (event, widgetId, hidden) => {
      if (!isManagerEvent(event)) {
        return undefined;
      }
      const widget = service.widgets.getById(widgetId);
      if (!widget) {
        return undefined;
      }
      return markUserVisibility(widgetId, hidden);
    },

    setWidgetPin: (event, widgetId, pin) => {
      if (!isManagerEvent(event)) {
        return undefined;
      }
      const widget = service.widgets.getById(widgetId);
      if (!widget) {
        return undefined;
      }
      const targetWindow = windows.get(widgetId);
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.setAlwaysOnTop(pin || service.settings.ensure().pinAll);
      }
      return service.widgets.update(widgetId, { pin });
    },

    setAllWidgetsHidden: (event, hidden) => {
      if (!isManagerEvent(event)) {
        return undefined;
      }
      service.widgets.list().forEach((widget) => {
        markUserVisibility(widget.id, hidden);
      });
      return service.widgets.list();
    },

    setActiveTab: (event, activeTab) => {
      const widgetId = widgetIdForEvent(event);
      if (!widgetId) {
        return undefined;
      }
      const widget = service.widgets.getById(widgetId);
      if (!widget || widget.type !== 'desk') {
        return undefined;
      }
      return service.widgets.update(widgetId, { activeTab });
    },

    getTodosForEvent: (event) => {
      const widgetId = widgetIdForEvent(event);
      return widgetId ? service.todos.listByWidget(widgetId) : undefined;
    },

    createTodo: (event, text) => {
      const widgetId = widgetIdForEvent(event);
      return widgetId ? service.createTodo({ widgetId, text }) : undefined;
    },

    updateTodo: (event, todoId, patch) => {
      if (!todoForEvent(event, todoId)) {
        return undefined;
      }
      return service.todos.update(todoId, patch);
    },

    deleteTodo: (event, todoId) => {
      const widgetId = widgetIdForEvent(event);
      const todo = todoForEvent(event, todoId);
      if (!widgetId || !todo) {
        return undefined;
      }
      if (contentTrash) {
        clearTimeout(contentTrash.timer);
      }
      if (!service.todos.delete(todoId)) {
        return undefined;
      }
      const timer = setTimeout(() => {
        if (contentTrash?.kind === 'todo' && contentTrash.item.id === todo.id) {
          contentTrash = undefined;
        }
      }, 5_000);
      contentTrash = { kind: 'todo', widgetId, item: todo, timer };
      return todo;
    },

    restoreTodo: (event) => {
      const widgetId = widgetIdForEvent(event);
      if (
        !widgetId ||
        !contentTrash ||
        contentTrash.kind !== 'todo' ||
        contentTrash.widgetId !== widgetId
      ) {
        return undefined;
      }
      const { item: todo, timer } = contentTrash;
      clearTimeout(timer);
      contentTrash = undefined;
      return service.createTodo({
        id: todo.id,
        widgetId: todo.widgetId,
        text: todo.text,
        done: todo.done,
        sortOrder: todo.sortOrder,
        createdAt: todo.createdAt,
        updatedAt: todo.updatedAt,
      });
    },

    reorderTodos: (event, orderedIds) => {
      const widgetId = widgetIdForEvent(event);
      if (!widgetId) {
        return undefined;
      }
      return service.todos.reorder(widgetId, orderedIds);
    },

    getClipsForEvent: (event) => {
      const widgetId = widgetIdForEvent(event);
      return widgetId ? service.clipItems.listByWidget(widgetId) : undefined;
    },

    createClip: (event, text) => {
      const widgetId = widgetIdForEvent(event);
      return widgetId ? service.createClipItem({ widgetId, text }) : undefined;
    },

    updateClip: (event, clipId, patch) => {
      if (!clipForEvent(event, clipId)) {
        return undefined;
      }
      return service.clipItems.update(clipId, patch);
    },

    deleteClip: (event, clipId) => {
      const widgetId = widgetIdForEvent(event);
      const clip = clipForEvent(event, clipId);
      if (!widgetId || !clip || !service.clipItems.delete(clipId)) {
        return undefined;
      }
      if (contentTrash) {
        clearTimeout(contentTrash.timer);
      }
      const timer = setTimeout(() => {
        if (contentTrash?.kind === 'clip' && contentTrash.item.id === clip.id) {
          contentTrash = undefined;
        }
      }, 5_000);
      contentTrash = { kind: 'clip', widgetId, item: clip, timer };
      return clip;
    },

    restoreClip: (event) => {
      const widgetId = widgetIdForEvent(event);
      if (
        !widgetId ||
        !contentTrash ||
        contentTrash.kind !== 'clip' ||
        contentTrash.widgetId !== widgetId
      ) {
        return undefined;
      }
      const { item: clip, timer } = contentTrash;
      clearTimeout(timer);
      contentTrash = undefined;
      return service.createClipItem({
        id: clip.id,
        widgetId: clip.widgetId,
        text: clip.text,
        sortOrder: clip.sortOrder,
        createdAt: clip.createdAt,
        updatedAt: clip.updatedAt,
      });
    },

    reorderClips: (event, orderedIds) => {
      const widgetId = widgetIdForEvent(event);
      if (!widgetId) {
        return undefined;
      }
      return service.clipItems.reorder(widgetId, orderedIds);
    },

    copyClip: (event, clipId) => {
      const clip = clipForEvent(event, clipId);
      if (!clip) {
        return undefined;
      }
      clipboard.writeText(clip.text);
      return clip;
    },

    saveNote: (event, noteText) => {
      const widgetId = widgetIdForEvent(event);
      if (!widgetId) {
        return undefined;
      }
      return service.widgets.update(widgetId, { noteText });
    },

    hide: (event) => {
      const target = showWidgetForEvent(event);
      if (!target?.window || target.window.isDestroyed()) {
        return false;
      }
      markUserVisibility(target.widgetId, true);
      return true;
    },

    setSize: (event, width, height) => {
      const target = showWidgetForEvent(event);
      if (!target?.window || target.window.isDestroyed()) {
        return undefined;
      }
      const widget = service.widgets.getById(target.widgetId);
      if (!widget || widget.collapsed) {
        return widget;
      }
      const display = screen.getDisplayMatching(target.window.getBounds());
      const bounds = target.window.getBounds();
      const nextBounds = {
        ...bounds,
        width: clamp(Math.round(width), MIN_WIDTH, display.workArea.width),
        height: clamp(Math.round(height), MIN_HEIGHT, display.workArea.height),
      };
      target.window.setBounds(nextBounds);
      persistBounds(target.widgetId, target.window, nextBounds);
      return service.widgets.getById(target.widgetId);
    },

    setOpacity: (event, opacity) => {
      const target = showWidgetForEvent(event);
      if (!target?.window || target.window.isDestroyed()) {
        return undefined;
      }
      const normalizedOpacity = clamp(Math.round(opacity), 35, 100);
      target.window.setOpacity(normalizedOpacity / 100);
      return service.widgets.update(target.widgetId, { opacity: normalizedOpacity });
    },

    setPin: (event, pin) => {
      const target = showWidgetForEvent(event);
      if (!target?.window || target.window.isDestroyed()) {
        return undefined;
      }
      target.window.setAlwaysOnTop(pin || service.settings.ensure().pinAll);
      return service.widgets.update(target.widgetId, { pin });
    },

    setCollapsed: (event, collapsed) => {
      const target = showWidgetForEvent(event);
      if (!target?.window || target.window.isDestroyed()) {
        return undefined;
      }
      const widget = service.widgets.getById(target.widgetId);
      if (!widget) {
        return undefined;
      }
      const updated = service.widgets.update(target.widgetId, { collapsed });
      target.window.setResizable(!collapsed);
      target.window.setBounds({
        ...target.window.getBounds(),
        height: collapsed ? COLLAPSED_HEIGHT : widget.height,
      });
      return updated;
    },

    focusFirstVisible: () => {
      const firstWindow = [...windows.values()].find((window) => !window.isDestroyed() && window.isVisible());
      firstWindow?.focus();
    },

    prepareQuit: () => {
      quitting = true;
      if (systemStatePollTimer) {
        clearInterval(systemStatePollTimer);
        systemStatePollTimer = undefined;
      }
      autoHideStates.clear();
      visibilityVersions.clear();
      nativeTheme.removeListener('updated', handleNativeThemeUpdated);
      if (contentTrash) {
        clearTimeout(contentTrash.timer);
        contentTrash = undefined;
      }
      persistTimers.forEach((timer, widgetId) => {
        clearTimeout(timer);
        const window = windows.get(widgetId);
        if (window && !window.isDestroyed()) {
          persistBounds(widgetId, window, window.getBounds());
        }
      });
      persistTimers.clear();
      if (managerWindow && !managerWindow.isDestroyed()) {
        managerWindow.destroy();
      }
      if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.destroy();
      }
      if (colorsWindow && !colorsWindow.isDestroyed()) {
        colorsWindow.destroy();
      }
    },
  };
}

export function registerDisplayRecovery(manager: WindowManager) {
  screen.on('display-added', () => manager.openVisibleWidgets());
  screen.on('display-removed', () => manager.openVisibleWidgets());
}
