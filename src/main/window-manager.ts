import path from 'node:path';
import { type Rectangle, BrowserWindow, type IpcMainInvokeEvent, app, screen } from 'electron';
import { type Widget, type WidgetType, type Settings, type CustomKit, type DeskTab, type Todo, type ClipItem, DEFAULT_COLORS } from './database/schema';
import { type UpdateSettingsInput, type UpdateTodoInput, type UpdateClipItemInput, type CreateWidgetInput } from './database/repositories';
import { type PinColorContext } from '../shared/types';
import { type ColorSet, type ColorPreview, normalizeKitColors } from '../shared/colors';
import { type AppDatabaseService } from './database/app-service';
import { type WidgetWindow, type UtilityWindow } from './windows/identities';
import { settingsToColors, colorsToWidgetPatch } from './services/color-model';
import { normalizeBounds, MIN_WIDTH, MIN_HEIGHT, rectanglesMatch, displayForNativeMonitor, DEFAULT_BOUNDS, clamp, snapBounds, COLLAPSED_HEIGHT } from './windows/geometry';
import { readForegroundWindow, isFullscreenForeground, isDesktopForeground } from './platform/foreground-window';
import { widgetIdForEvent, isManagerEvent, isSettingsEvent, colorsScopeForEvent } from './windows/identities';
import { createColorActions } from './services/color-actions';
import { createContentActions } from './services/content-actions';

const SYSTEM_STATE_POLL_MS = 600;

type AutoHideReason = 'desktop' | 'fullscreen';

type AutoHideState = {
  reasons: Set<AutoHideReason>;
  wasVisible: boolean;
  visibilityVersion: number;
  userOverride: boolean;
};

type SystemVisibilityState = {
  desktopShown: boolean;
  fullscreenDisplays: Array<{ id?: number; bounds: Rectangle }>;
};

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
  getSettings(): Settings;
  updateSettings(event: IpcMainInvokeEvent, patch: UpdateSettingsInput): Settings | undefined;
  resetSettings(event: IpcMainInvokeEvent): Settings | undefined;
  getColorContext(event: IpcMainInvokeEvent): PinColorContext | undefined;
  applyDefaultPreset(event: IpcMainInvokeEvent, presetId: string): Settings | undefined;
  applyWidgetPreset(event: IpcMainInvokeEvent, presetId: string): Widget | undefined;
  setWidgetFollowDefault(event: IpcMainInvokeEvent, followsDefault: boolean): Widget | undefined;
  previewColorKit(event: IpcMainInvokeEvent, colors: ColorSet): boolean;
  endColorPreview(event: IpcMainInvokeEvent): boolean;
  getColorPreview(): ColorPreview | null;
  listColorKits(event: IpcMainInvokeEvent): CustomKit[] | undefined;
  createColorKit(event: IpcMainInvokeEvent, name: string, colors: ColorSet): CustomKit | undefined;
  updateColorKit(event: IpcMainInvokeEvent, kitId: string, name: string, colors: ColorSet): CustomKit | undefined;
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
  getBounds(event: IpcMainInvokeEvent): Rectangle | undefined;
  setSize(event: IpcMainInvokeEvent, width: number, height: number): Widget | undefined;
  setPosition(event: IpcMainInvokeEvent, x: number, y: number): Widget | undefined;
  setOpacity(event: IpcMainInvokeEvent, opacity: number): Widget | undefined;
  setPin(event: IpcMainInvokeEvent, pin: boolean): Widget | undefined;
  setCollapsed(event: IpcMainInvokeEvent, collapsed: boolean): Widget | undefined;
  focusFirstVisible(): void;
  prepareQuit(): void;
}

export function createWindowManager(service: AppDatabaseService): WindowManager {
  const windows = new Map<string, WidgetWindow>();
  let managerWindow: UtilityWindow | undefined;
  let colorPreview: ColorPreview | null = null;
  const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
  
  let quitting = false;
  const autoHideStates = new Map<string, AutoHideState>();
  const visibilityVersions = new Map<string, number>();
  let systemStatePollTimer: ReturnType<typeof setInterval> | undefined;
  let systemStatePollInFlight = false;
  let currentSystemVisibility: SystemVisibilityState = {
    desktopShown: false,
    fullscreenDisplays: [],
  };

  const broadcastColorPreview = () => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) window.webContents.send('colors:preview-changed', colorPreview);
    });
  };

  const clearColorPreview = () => {
    if (!colorPreview) return;
    colorPreview = null;
    broadcastColorPreview();
  };

  const broadcastSettings = (settings: Settings) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send('settings:changed', settings);
      }
    });
  };

  const broadcastWidget = (widget: Widget) => {
    const recipients = [windows.get(widget.id), managerWindow];
    const sent = new Set<BrowserWindow>();
    recipients.forEach((targetWindow) => {
      if (targetWindow && !targetWindow.isDestroyed() && !sent.has(targetWindow)) {
        sent.add(targetWindow);
        targetWindow.webContents.send('widget:changed', widget);
      }
    });
  };

  const broadcastWidgetDeleted = (widgetId: string) => {
    const recipients = [managerWindow];
    recipients.forEach((targetWindow) => {
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('widget:deleted', widgetId);
      }
    });
  };

  const syncDefaultColors = (settings: Settings) => {
    const colors = settingsToColors(settings);
    service.widgets.list().filter((widget) => widget.followsDefault).forEach((widget) => {
      const updated = service.widgets.update(widget.id, { ...colorsToWidgetPatch(colors), colorKitId: settings.defaultColorKitId });
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
      patch.defaultShadowColor !== undefined ||
      patch.defaultColorKitId !== undefined
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

  const loadManager = (window: UtilityWindow, renameWidgetId?: string, page: 'manager' | 'settings' | 'colors' = 'manager') => {
    clearColorPreview();
    window.__pinView = page;
    const query: Record<string, string> = { role: 'manager', id: 'manager', page };
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

  const loadColors = (window: UtilityWindow) => {
    clearColorPreview();
    const query: Record<string, string> = {
      role: 'manager',
      id: 'colors',
      page: 'colors',
      scope: window.__pinColorsScope ?? 'default',
    };
    if (window.__pinColorsWidgetId) {
      query.widgetId = window.__pinColorsWidgetId;
    }
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
      window.__pinView = 'colors';
      void window.loadURL(
        `${MAIN_WINDOW_VITE_DEV_SERVER_URL}?${new URLSearchParams(query).toString()}`,
      );
    } else {
      window.__pinView = 'colors';
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
      roundedCorners: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
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

    window.on('move', () => {
      if (window.isDestroyed()) {
        return;
      }
      const currentBounds = window.getBounds();
      schedulePersistBounds(widgetId, window, currentBounds);
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
      const updated = service.widgets.update(widgetId, { hidden: true });
      if (updated) {
        broadcastWidget(updated);
      }
      return updated;
    }
    service.widgets.update(widgetId, { hidden: false });
    openWidget(widgetId);
    const updated = service.widgets.getById(widgetId);
    if (updated) {
      broadcastWidget(updated);
    }
    return updated;
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

  const openManager = (renameWidgetId?: string, page: 'manager' | 'settings' | 'colors' = 'manager') => {
    if (managerWindow && !managerWindow.isDestroyed()) {
      if (page !== 'colors') {
        loadManager(managerWindow, renameWidgetId, page);
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
      roundedCorners: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
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
        clearColorPreview();
        managerWindow?.hide();
      }
    });
    managerWindow.once('closed', () => {
      clearColorPreview();
      managerWindow = undefined;
    });
    managerWindow.webContents.on('render-process-gone', clearColorPreview);
    managerWindow.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) clearColorPreview();
    });
    managerWindow.once('ready-to-show', () => {
      if (!quitting && managerWindow && !managerWindow.isDestroyed()) {
        managerWindow.show();
      }
    });
    if (page !== 'colors') {
      loadManager(managerWindow, renameWidgetId, page);
    }
    return managerWindow;
  };

  const openSettings = () => {
    const window = openManager(undefined, 'settings');
    window.show();
    window.focus();
    return window;
  };

  const openColors = (scope: 'default' | 'widget', widgetId?: string) => {
    if (scope === 'widget' && (!widgetId || !service.widgets.getById(widgetId))) {
      return openColors('default');
    }
    const window = openManager(undefined, 'colors');
    const utilityWindow = window as UtilityWindow;
    utilityWindow.__pinColorsScope = scope;
    utilityWindow.__pinColorsWidgetId = widgetId;
    loadColors(utilityWindow);
    window.show();
    window.focus();
    return window;
  };

  const showWidgetForEvent = (event: IpcMainInvokeEvent) => {
    const widgetId = widgetIdForEvent(event);
    if (!widgetId) {
      return undefined;
    }
    return { widgetId, window: windows.get(widgetId) };
  };

  const { deleteWidgetById, clearUndo, ...contentActions } = createContentActions(service, {
    cancelWidgetPersist: (widgetId) => {
      const timer = persistTimers.get(widgetId);
      if (timer) {
        clearTimeout(timer);
        persistTimers.delete(widgetId);
      }
    },
    closeWidget: (widgetId) => {
      const targetWindow = windows.get(widgetId);
      if (targetWindow && !targetWindow.isDestroyed()) targetWindow.destroy();
      windows.delete(widgetId);
    },
    onWidgetDeleted: (widgetId) => {
      if (colorPreview?.scope === 'widget' && colorPreview.widgetId === widgetId) clearColorPreview();
      broadcastWidgetDeleted(widgetId);
    },
    openWidget,
    broadcastWidget,
  });
  const colorActions = createColorActions(service, {
    isUtilityEvent: (event) => BrowserWindow.fromWebContents(event.sender) === managerWindow,
    updateGlobalSettings,
    broadcastWidget,
  });

  if (process.platform === 'win32') {
    void pollSystemVisibility();
    systemStatePollTimer = setInterval(() => {
      void pollSystemVisibility();
    }, SYSTEM_STATE_POLL_MS);
  }

  return {
    ...colorActions,
    ...contentActions,
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
      clearColorPreview();
      managerWindow.hide();
      return true;
    },

    openSettings,

    hideSettings: (event) => {
      if (!isSettingsEvent(event) || !managerWindow || managerWindow.isDestroyed()) {
        return false;
      }
      clearColorPreview();
      managerWindow.hide();
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
      if (!colorsScopeForEvent(event) || !managerWindow || managerWindow.isDestroyed()) {
        return false;
      }
      clearColorPreview();
      managerWindow.hide();
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
        colorKitId: service.settings.ensure().defaultColorKitId,
        followsDefault: true,
      };
      const widget = service.widgets.create(input);
      openWidget(widget.id);
      broadcastWidget(widget);
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
        colorKitId: service.settings.ensure().defaultColorKitId,
        followsDefault: true,
      });
      openWidget(widget.id);
      broadcastWidget(widget);
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

    getSettings: () => service.settings.ensure(),

    updateSettings: (event, patch) => {
      if (!isSettingsEvent(event)) {
        return undefined;
      }
      return updateGlobalSettings(patch);
    },

    resetSettings: (event) => {
      if (!isSettingsEvent(event)) {
        return undefined;
      }
      return updateGlobalSettings({
        defaultColorKitId: null,
        defaultPaperColor: DEFAULT_COLORS.paper,
        defaultInkColor: DEFAULT_COLORS.ink,
        defaultTitleColor: DEFAULT_COLORS.title,
        defaultAccentColor: DEFAULT_COLORS.accent,
        defaultSpineColor: DEFAULT_COLORS.spine,
        defaultShadowColor: DEFAULT_COLORS.shadow,
        fontSize: 13,
        maxLines: 0,
        hoverFull: true,
        opacityBar: true,
        defaultOpacity: 100,
        pinAll: false,
        autostart: false,
        snap: true,
      });
    },

    getColorPreview: () => colorPreview,

    previewColorKit: (event, colors) => {
      const context = colorsScopeForEvent(event);
      if (context?.scope !== 'default' && context?.scope !== 'widget') return false;
      if (context.scope === 'widget' && !service.widgets.getById(context.widgetId ?? '')) return false;
      colorPreview = { scope: context.scope, widgetId: context.widgetId, colors: normalizeKitColors(colors) };
      broadcastColorPreview();
      return true;
    },

    endColorPreview: (event) => {
      if (BrowserWindow.fromWebContents(event.sender) !== managerWindow) return false;
      clearColorPreview();
      return true;
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

    hide: (event) => {
      const target = showWidgetForEvent(event);
      if (!target?.window || target.window.isDestroyed()) {
        return false;
      }
      markUserVisibility(target.widgetId, true);
      return true;
    },

    getBounds: (event) => {
      const target = showWidgetForEvent(event);
      if (target?.window && !target.window.isDestroyed()) {
        return target.window.getBounds();
      }
      const senderWindow = BrowserWindow.fromWebContents(event.sender);
      if (
        senderWindow &&
        !senderWindow.isDestroyed() &&
        senderWindow === managerWindow
      ) {
        return senderWindow.getBounds();
      }
      return undefined;
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

    setPosition: (event, x, y) => {
      const target = showWidgetForEvent(event);
      if (!target?.window || target.window.isDestroyed()) {
        const senderWindow = BrowserWindow.fromWebContents(event.sender);
        if (
          senderWindow &&
          !senderWindow.isDestroyed() &&
          senderWindow === managerWindow
        ) {
          senderWindow.setPosition(Math.round(x), Math.round(y));
        }
        return undefined;
      }
      const bounds = target.window.getBounds();
      const proposedBounds = {
        ...bounds,
        x: Math.round(x),
        y: Math.round(y),
      };
      const nextBounds = service.settings.ensure().snap
        ? snapBounds(proposedBounds)
        : proposedBounds;
      target.window.setPosition(nextBounds.x, nextBounds.y);
      persistBounds(target.widgetId, target.window, nextBounds);
      return service.widgets.getById(target.widgetId);
    },

    setOpacity: (event, opacity) => {
      const target = showWidgetForEvent(event);
      if (!target?.window || target.window.isDestroyed()) {
        return undefined;
      }
      const normalizedOpacity = clamp(Math.round(opacity), 5, 100);
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
      clearColorPreview();
      if (systemStatePollTimer) {
        clearInterval(systemStatePollTimer);
        systemStatePollTimer = undefined;
      }
      autoHideStates.clear();
      visibilityVersions.clear();
      clearUndo();
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
    },
  };
}
