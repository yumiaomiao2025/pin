import {
  BrowserWindow,
  screen,
  type IpcMainInvokeEvent,
  type Rectangle,
} from 'electron';
import path from 'node:path';

import type { AppDatabaseService } from './database/app-service';
import type { CreateWidgetInput, UpdateTodoInput } from './database/repositories';
import type { Settings, Todo, Widget, WidgetType } from './database/schema';

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

export interface WindowManager {
  openVisibleWidgets(): void;
  openWidget(widgetId: string): BrowserWindow | undefined;
  createWidget(type: WidgetType): Widget;
  getSettings(): Settings;
  getWidgetForEvent(event: IpcMainInvokeEvent): Widget | undefined;
  getTodosForEvent(event: IpcMainInvokeEvent): Todo[] | undefined;
  createTodo(event: IpcMainInvokeEvent, text: string): Todo | undefined;
  updateTodo(event: IpcMainInvokeEvent, todoId: string, patch: UpdateTodoInput): Todo | undefined;
  deleteTodo(event: IpcMainInvokeEvent, todoId: string): Todo | undefined;
  restoreTodo(event: IpcMainInvokeEvent): Todo | undefined;
  reorderTodos(event: IpcMainInvokeEvent, orderedIds: string[]): Todo[] | undefined;
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

export function createWindowManager(service: AppDatabaseService): WindowManager {
  const windows = new Map<string, WidgetWindow>();
  const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let todoTrash: { widgetId: string; todo: Todo; timer: ReturnType<typeof setTimeout> } | undefined;
  let quitting = false;

  const widgetIdForEvent = (event: IpcMainInvokeEvent) => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    if (!senderWindow || !isWidgetWindow(senderWindow)) {
      return undefined;
    }
    return senderWindow.__pinWidgetId;
  };

  const todoForEvent = (event: IpcMainInvokeEvent, todoId: string) => {
    const widgetId = widgetIdForEvent(event);
    if (!widgetId) {
      return undefined;
    }
    const todo = service.todos.getById(todoId);
    return todo?.widgetId === widgetId ? todo : undefined;
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
    window.setAlwaysOnTop(widget.pin);

    let snapping = false;
    window.on('move', () => {
      if (snapping || window.isDestroyed()) {
        return;
      }
      const currentBounds = window.getBounds();
      const nextBounds = snapBounds(currentBounds);
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

    openWidget,

    createWidget: (type) => {
      const defaults = DEFAULT_BOUNDS[type];
      const input: CreateWidgetInput = {
        type,
        width: defaults.width,
        height: defaults.height,
        x: screen.getPrimaryDisplay().workArea.x + 32,
        y: screen.getPrimaryDisplay().workArea.y + 32,
        hidden: false,
      };
      const widget = service.widgets.create(input);
      openWidget(widget.id);
      return widget;
    },

    getSettings: () => service.settings.ensure(),

    getWidgetForEvent: (event) => {
      const widgetId = widgetIdForEvent(event);
      return widgetId ? service.widgets.getById(widgetId) : undefined;
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
      if (todoTrash) {
        clearTimeout(todoTrash.timer);
      }
      if (!service.todos.delete(todoId)) {
        return undefined;
      }
      const timer = setTimeout(() => {
        if (todoTrash?.todo.id === todo.id) {
          todoTrash = undefined;
        }
      }, 5_000);
      todoTrash = { widgetId, todo, timer };
      return todo;
    },

    restoreTodo: (event) => {
      const widgetId = widgetIdForEvent(event);
      if (!widgetId || !todoTrash || todoTrash.widgetId !== widgetId) {
        return undefined;
      }
      const { todo, timer } = todoTrash;
      clearTimeout(timer);
      todoTrash = undefined;
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
      target.window.setAlwaysOnTop(pin);
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
      if (todoTrash) {
        clearTimeout(todoTrash.timer);
        todoTrash = undefined;
      }
      persistTimers.forEach((timer, widgetId) => {
        clearTimeout(timer);
        const window = windows.get(widgetId);
        if (window && !window.isDestroyed()) {
          persistBounds(widgetId, window, window.getBounds());
        }
      });
      persistTimers.clear();
    },
  };
}

export function registerDisplayRecovery(manager: WindowManager) {
  screen.on('display-added', () => manager.openVisibleWidgets());
  screen.on('display-removed', () => manager.openVisibleWidgets());
}
