import {
  app,
  BrowserWindow,
  clipboard,
  screen,
  type IpcMainInvokeEvent,
  type Rectangle,
} from 'electron';
import path from 'node:path';

import type { AppDatabaseService } from './database/app-service';
import type {
  CreateWidgetInput,
  UpdateClipItemInput,
  UpdateSettingsInput,
  UpdateTodoInput,
} from './database/repositories';
import { DEFAULT_COLORS, type ClipItem, type DeskTab, type Settings, type Todo, type Widget, type WidgetType } from './database/schema';

const MIN_WIDTH = 240;
const MIN_HEIGHT = 160;
const COLLAPSED_HEIGHT = 32;
const SNAP_DISTANCE = 12;

const DEFAULT_BOUNDS: Record<WidgetType, { width: number; height: number }> = {
  note: { width: 320, height: 230 },
  todo: { width: 320, height: 480 },
  clip: { width: 320, height: 220 },
  desk: { width: 320, height: 480 },
};

type WidgetWindow = BrowserWindow & { __pinWidgetId?: string };
type UtilityWindow = BrowserWindow & { __pinRole?: 'manager' | 'settings' };

export interface WindowManager {
  openVisibleWidgets(): void;
  showAllWidgets(): void;
  hideAllWidgets(): void;
  openWidget(widgetId: string): BrowserWindow | undefined;
  openManager(): BrowserWindow;
  hideManager(event: IpcMainInvokeEvent): boolean;
  openSettings(): BrowserWindow;
  hideSettings(event: IpcMainInvokeEvent): boolean;
  createWidget(type: WidgetType): Widget;
  createWidgetForEvent(event: IpcMainInvokeEvent, type: WidgetType): Widget | undefined;
  renameWidget(event: IpcMainInvokeEvent, widgetId: string, title: string): Widget | undefined;
  deleteWidget(event: IpcMainInvokeEvent, widgetId: string): Widget | undefined;
  restoreWidget(event: IpcMainInvokeEvent): Widget | undefined;
  getSettings(): Settings;
  updateSettings(event: IpcMainInvokeEvent, patch: UpdateSettingsInput): Settings | undefined;
  resetSettings(event: IpcMainInvokeEvent): Settings | undefined;
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

export function createWindowManager(service: AppDatabaseService): WindowManager {
  const windows = new Map<string, WidgetWindow>();
  let managerWindow: UtilityWindow | undefined;
  let settingsWindow: UtilityWindow | undefined;
  const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let contentTrash:
    | { kind: 'todo'; widgetId: string; item: Todo; timer: ReturnType<typeof setTimeout> }
    | { kind: 'clip'; widgetId: string; item: ClipItem; timer: ReturnType<typeof setTimeout> }
    | { kind: 'widget'; item: Widget; todos: Todo[]; clips: ClipItem[]; timer: ReturnType<typeof setTimeout> }
    | undefined;
  let quitting = false;

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

  const broadcastSettings = (settings: Settings) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      if (!window.isDestroyed()) {
        window.webContents.send('settings:changed', settings);
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
    applyGlobalWindowSettings(updated);
    broadcastSettings(updated);
    return updated;
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

  const loadManager = (window: UtilityWindow) => {
    const query = { role: 'manager', id: 'manager' };
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

  const openWidget = (widgetId: string) => {
    const existingWindow = windows.get(widgetId);
    if (existingWindow && !existingWindow.isDestroyed()) {
      const existingWidget = service.widgets.getById(widgetId);
      if (existingWidget) {
        const recoveredBounds = normalizeBounds(existingWidget);
        existingWindow.setBounds(recoveredBounds);
        persistBounds(widgetId, existingWindow, recoveredBounds);
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
        window.hide();
        service.widgets.update(widgetId, { hidden: true });
      }
    });
    window.on('closed', () => {
      windows.delete(widgetId);
    });
    window.once('ready-to-show', () => {
      if (!widget.hidden && !window.isDestroyed()) {
        window.show();
      }
    });

    loadWidget(window, widgetId);
    if (widget.hidden) {
      return window;
    }
    return window;
  };

  const openManager = () => {
    if (managerWindow && !managerWindow.isDestroyed()) {
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
    loadManager(managerWindow);
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

  const showWidgetForEvent = (event: IpcMainInvokeEvent) => {
    const widgetId = widgetIdForEvent(event);
    if (!widgetId) {
      return undefined;
    }
    return { widgetId, window: windows.get(widgetId) };
  };

  return {
    openVisibleWidgets: () => {
      service.widgets.list().filter((widget) => !widget.hidden).forEach((widget) => {
        openWidget(widget.id);
      });
    },

    showAllWidgets: () => {
      service.widgets.list().forEach((widget) => {
        service.widgets.update(widget.id, { hidden: false });
        openWidget(widget.id);
      });
    },

    hideAllWidgets: () => {
      service.widgets.list().forEach((widget) => {
        const targetWindow = windows.get(widget.id);
        if (targetWindow && !targetWindow.isDestroyed()) {
          targetWindow.hide();
        }
        service.widgets.update(widget.id, { hidden: true });
      });
    },

    openWidget,

    openManager,

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

    createWidget: (type) => {
      const defaults = DEFAULT_BOUNDS[type];
      const input: CreateWidgetInput = {
        type,
        width: defaults.width,
        height: defaults.height,
        opacity: service.settings.ensure().defaultOpacity,
        x: screen.getPrimaryDisplay().workArea.x + 32,
        y: screen.getPrimaryDisplay().workArea.y + 32,
        hidden: false,
      };
      const widget = service.widgets.create(input);
      openWidget(widget.id);
      return widget;
    },

    createWidgetForEvent: (event, type) => {
      if (!isManagerEvent(event)) {
        return undefined;
      }
      const widget = service.widgets.create({
        type,
        width: DEFAULT_BOUNDS[type].width,
        height: DEFAULT_BOUNDS[type].height,
        opacity: service.settings.ensure().defaultOpacity,
        x: screen.getPrimaryDisplay().workArea.x + 32,
        y: screen.getPrimaryDisplay().workArea.y + 32,
        hidden: false,
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

      const timer = setTimeout(() => {
        if (contentTrash?.kind === 'widget' && contentTrash.item.id === widget.id) {
          contentTrash = undefined;
        }
      }, 5_000);
      contentTrash = { kind: 'widget', item: widget, todos, clips, timer };
      return widget;
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
      });
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
      if (hidden) {
        const targetWindow = windows.get(widgetId);
        if (targetWindow && !targetWindow.isDestroyed()) {
          targetWindow.hide();
        }
        return service.widgets.update(widgetId, { hidden: true });
      }
      service.widgets.update(widgetId, { hidden: false });
      openWidget(widgetId);
      return service.widgets.getById(widgetId);
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
        if (hidden) {
          const targetWindow = windows.get(widget.id);
          if (targetWindow && !targetWindow.isDestroyed()) {
            targetWindow.hide();
          }
          service.widgets.update(widget.id, { hidden: true });
        } else {
          openWidget(widget.id);
        }
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
      target.window.hide();
      service.widgets.update(target.widgetId, { hidden: true });
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
    },
  };
}

export function registerDisplayRecovery(manager: WindowManager) {
  screen.on('display-added', () => manager.openVisibleWidgets());
  screen.on('display-removed', () => manager.openVisibleWidgets());
}
