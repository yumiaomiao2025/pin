import { app, BrowserWindow, ipcMain, Menu, nativeImage, Tray } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { createAppDatabaseService } from './main/database/app-service';
import { closeAppDatabase, initializeAppDatabase } from './main/database/app-database';
import {
  DESK_TABS,
  SCROLLBAR_MODES,
  THEMES,
  WIDGET_TYPES,
  type DeskTab,
  type ScrollbarMode,
  type Theme,
  type WidgetType,
} from './main/database/schema';
import type { UpdateSettingsInput } from './main/database/repositories';
import {
  createWindowManager,
  registerDisplayRecovery,
  type WindowManager,
} from './main/window-manager';

const WIDGET_OPTIONS_LABELS: Record<WidgetType, string> = {
  note: '新便签',
  todo: '新待办清单',
  clip: '新剪贴板',
  desk: '新三合一',
};

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.quit();
}

let windowManager: WindowManager | undefined;
let onboardingWindow: BrowserWindow | undefined;
let tray: Tray | undefined;

const createTray = () => {
  if (tray) {
    return;
  }
  const bitmap = Buffer.alloc(16 * 16 * 4);
  for (let index = 0; index < bitmap.length; index += 4) {
    bitmap[index] = 17;
    bitmap[index + 1] = 17;
    bitmap[index + 2] = 17;
    bitmap[index + 3] = 255;
  }
  tray = new Tray(nativeImage.createFromBitmap(bitmap, { width: 16, height: 16, scaleFactor: 1 }));
  tray.setToolTip('Pin');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '管理面板…',
        click: () => windowManager?.openManager(),
      },
      {
        label: '设置',
        click: () => windowManager?.openSettings(),
      },
      {
        label: '全部显示',
        click: () => windowManager?.showAllWidgets(),
      },
      {
        label: '全部隐藏',
        click: () => windowManager?.hideAllWidgets(),
      },
      { type: 'separator' },
      {
        label: '新建',
        submenu: WIDGET_TYPES.map((type) => ({
          label: WIDGET_OPTIONS_LABELS[type],
          click: () => windowManager?.createWidget(type),
        })),
      },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]),
  );
  tray.on('double-click', () => windowManager?.openManager());
};

const loadOnboarding = (window: BrowserWindow) => {
  const query = { role: 'onboarding', id: 'onboarding' };
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

const createOnboardingWindow = () => {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.focus();
    return onboardingWindow;
  }

  onboardingWindow = new BrowserWindow({
    width: 420,
    height: 240,
    minWidth: 320,
    minHeight: 200,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  onboardingWindow.once('closed', () => {
    onboardingWindow = undefined;
  });
  loadOnboarding(onboardingWindow);
  return onboardingWindow;
};

const getManager = () => {
  if (!windowManager) {
    throw new Error('Window manager has not been initialized');
  }
  return windowManager;
};

ipcMain.handle('app:ping', () => ({
  ok: true,
  version: app.getVersion(),
}));

ipcMain.handle('widget:get', (event) => getManager().getWidgetForEvent(event) ?? null);
ipcMain.handle('manager:open', () => {
  getManager().openManager();
  return true;
});
ipcMain.handle('manager:hide', (event) => getManager().hideManager(event));
ipcMain.handle('settings:open', () => {
  getManager().openSettings();
  return true;
});
ipcMain.handle('settings:hide', (event) => getManager().hideSettings(event));
ipcMain.handle('manager:list-widgets', (event) => getManager().getWidgetsForEvent(event) ?? null);
ipcMain.handle('manager:set-hidden', (event, input: unknown) => {
  if (
    !input ||
    typeof input !== 'object' ||
    !('id' in input) ||
    typeof input.id !== 'string' ||
    !('hidden' in input) ||
    typeof input.hidden !== 'boolean'
  ) {
    throw new TypeError('widget visibility update must contain id and hidden');
  }
  return getManager().setWidgetHidden(event, input.id, input.hidden) ?? null;
});
ipcMain.handle('manager:set-pin', (event, input: unknown) => {
  if (
    !input ||
    typeof input !== 'object' ||
    !('id' in input) ||
    typeof input.id !== 'string' ||
    !('pin' in input) ||
    typeof input.pin !== 'boolean'
  ) {
    throw new TypeError('widget pin update must contain id and pin');
  }
  return getManager().setWidgetPin(event, input.id, input.pin) ?? null;
});
ipcMain.handle('manager:set-all-hidden', (event, hidden: unknown) => {
  if (typeof hidden !== 'boolean') {
    throw new TypeError('all widget visibility must be a boolean');
  }
  return getManager().setAllWidgetsHidden(event, hidden) ?? null;
});
ipcMain.handle('manager:create-widget', (event, type: unknown) => {
  if (typeof type !== 'string' || !WIDGET_TYPES.includes(type as WidgetType)) {
    throw new TypeError('Unknown widget type');
  }
  return getManager().createWidgetForEvent(event, type as WidgetType) ?? null;
});
ipcMain.handle('manager:rename-widget', (event, input: unknown) => {
  if (
    !input ||
    typeof input !== 'object' ||
    !('id' in input) ||
    typeof input.id !== 'string' ||
    !('title' in input) ||
    typeof input.title !== 'string'
  ) {
    throw new TypeError('widget rename must contain id and title');
  }
  return getManager().renameWidget(event, input.id, input.title) ?? null;
});
ipcMain.handle('manager:delete-widget', (event, widgetId: unknown) => {
  if (typeof widgetId !== 'string') {
    throw new TypeError('widget id must be a string');
  }
  return getManager().deleteWidget(event, widgetId) ?? null;
});
ipcMain.handle('manager:restore-widget', (event) => getManager().restoreWidget(event) ?? null);
ipcMain.handle('desk:set-tab', (event, activeTab: unknown) => {
  if (typeof activeTab !== 'string' || !DESK_TABS.includes(activeTab as DeskTab)) {
    throw new TypeError('Unknown desk tab');
  }
  return getManager().setActiveTab(event, activeTab as DeskTab) ?? null;
});
ipcMain.handle('settings:get', () => getManager().getSettings());
ipcMain.handle('settings:update', (event, input: unknown) => {
  if (!input || typeof input !== 'object') {
    throw new TypeError('settings update must be an object');
  }
  const values = input as Record<string, unknown>;
  const patch: UpdateSettingsInput = {};
  if ('theme' in values && values.theme !== undefined) {
    if (typeof values.theme !== 'string' || !THEMES.includes(values.theme as Theme)) {
      throw new TypeError('Unknown theme');
    }
    patch.theme = values.theme as Theme;
  }
  if ('autoTheme' in values && values.autoTheme !== undefined) {
    if (typeof values.autoTheme !== 'boolean') {
      throw new TypeError('autoTheme must be a boolean');
    }
    patch.autoTheme = values.autoTheme;
  }
  if ('scrollbar' in values && values.scrollbar !== undefined) {
    if (typeof values.scrollbar !== 'string' || !SCROLLBAR_MODES.includes(values.scrollbar as ScrollbarMode)) {
      throw new TypeError('Unknown scrollbar mode');
    }
    patch.scrollbar = values.scrollbar as ScrollbarMode;
  }
  if ('maxLines' in values && values.maxLines !== undefined) {
    if (typeof values.maxLines !== 'number' || !Number.isInteger(values.maxLines) || values.maxLines < 0 || values.maxLines > 3) {
      throw new TypeError('maxLines must be an integer from 0 to 3');
    }
    patch.maxLines = values.maxLines;
  }
  if ('defaultOpacity' in values && values.defaultOpacity !== undefined) {
    if (typeof values.defaultOpacity !== 'number' || !Number.isInteger(values.defaultOpacity) || values.defaultOpacity < 35 || values.defaultOpacity > 100) {
      throw new TypeError('defaultOpacity must be an integer from 35 to 100');
    }
    patch.defaultOpacity = values.defaultOpacity;
  }
  (['hoverFull', 'opacityBar', 'pinAll', 'autostart', 'snap'] as const).forEach((key) => {
    if (key in values && values[key] !== undefined) {
      if (typeof values[key] !== 'boolean') {
        throw new TypeError(`${key} must be a boolean`);
      }
      patch[key] = values[key];
    }
  });
  if (Object.keys(patch).length === 0) {
    throw new TypeError('settings update is empty');
  }
  return getManager().updateSettings(event, patch) ?? null;
});
ipcMain.handle('settings:reset', (event) => getManager().resetSettings(event) ?? null);
ipcMain.handle('colors:open-default', () => {
  getManager().openColors('default');
  return true;
});
ipcMain.handle('colors:get-context', (event) => getManager().getColorContext(event) ?? null);
ipcMain.handle('colors:apply-preset', (event, presetId: unknown) => {
  if (typeof presetId !== 'string') {
    throw new TypeError('preset id must be a string');
  }
  return getManager().applyDefaultPreset(event, presetId) ?? null;
});
ipcMain.handle('colors:hide', (event) => getManager().hideColors(event));
ipcMain.handle('todo:list', (event) => getManager().getTodosForEvent(event) ?? null);
ipcMain.handle('todo:create', (event, text: unknown) => {
  if (typeof text !== 'string') {
    throw new TypeError('todo text must be a string');
  }
  return getManager().createTodo(event, text) ?? null;
});
ipcMain.handle('todo:update', (event, input: unknown) => {
  if (!input || typeof input !== 'object' || !('id' in input) || typeof input.id !== 'string') {
    throw new TypeError('todo update must contain an id');
  }
  const patch: { text?: string; done?: boolean } = {};
  if ('text' in input && input.text !== undefined) {
    if (typeof input.text !== 'string') {
      throw new TypeError('todo text must be a string');
    }
    patch.text = input.text;
  }
  if ('done' in input && input.done !== undefined) {
    if (typeof input.done !== 'boolean') {
      throw new TypeError('todo done must be a boolean');
    }
    patch.done = input.done;
  }
  if (Object.keys(patch).length === 0) {
    throw new TypeError('todo update must contain text or done');
  }
  return getManager().updateTodo(event, input.id, patch) ?? null;
});
ipcMain.handle('todo:delete', (event, todoId: unknown) => {
  if (typeof todoId !== 'string') {
    throw new TypeError('todo id must be a string');
  }
  return getManager().deleteTodo(event, todoId) ?? null;
});
ipcMain.handle('todo:restore', (event) => getManager().restoreTodo(event) ?? null);
ipcMain.handle('todo:reorder', (event, orderedIds: unknown) => {
  if (
    !Array.isArray(orderedIds) ||
    orderedIds.some((id) => typeof id !== 'string')
  ) {
    throw new TypeError('todo order must be an array of ids');
  }
  return getManager().reorderTodos(event, orderedIds) ?? null;
});
ipcMain.handle('clip:list', (event) => getManager().getClipsForEvent(event) ?? null);
ipcMain.handle('clip:create', (event, text: unknown) => {
  if (typeof text !== 'string') {
    throw new TypeError('clip text must be a string');
  }
  return getManager().createClip(event, text) ?? null;
});
ipcMain.handle('clip:update', (event, input: unknown) => {
  if (!input || typeof input !== 'object' || !('id' in input) || typeof input.id !== 'string') {
    throw new TypeError('clip update must contain an id');
  }
  if (!('text' in input) || typeof input.text !== 'string') {
    throw new TypeError('clip update must contain text');
  }
  return getManager().updateClip(event, input.id, { text: input.text }) ?? null;
});
ipcMain.handle('clip:delete', (event, clipId: unknown) => {
  if (typeof clipId !== 'string') {
    throw new TypeError('clip id must be a string');
  }
  return getManager().deleteClip(event, clipId) ?? null;
});
ipcMain.handle('clip:restore', (event) => getManager().restoreClip(event) ?? null);
ipcMain.handle('clip:reorder', (event, orderedIds: unknown) => {
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
    throw new TypeError('clip order must be an array of ids');
  }
  return getManager().reorderClips(event, orderedIds) ?? null;
});
ipcMain.handle('clip:copy', (event, clipId: unknown) => {
  if (typeof clipId !== 'string') {
    throw new TypeError('clip id must be a string');
  }
  return getManager().copyClip(event, clipId) ?? null;
});
ipcMain.handle('widget:save-note', (event, noteText: unknown) => {
  if (typeof noteText !== 'string') {
    throw new TypeError('noteText must be a string');
  }
  return getManager().saveNote(event, noteText) ?? null;
});
ipcMain.handle('window:hide', (event) => getManager().hide(event));
ipcMain.handle('window:set-size', (event, size: unknown) => {
  if (
    !size ||
    typeof size !== 'object' ||
    !('width' in size) ||
    !('height' in size) ||
    typeof size.width !== 'number' ||
    typeof size.height !== 'number' ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height)
  ) {
    throw new TypeError('size must contain finite width and height numbers');
  }
  return getManager().setSize(event, size.width, size.height) ?? null;
});
ipcMain.handle('window:set-opacity', (event, opacity: unknown) => {
  if (typeof opacity !== 'number' || !Number.isFinite(opacity)) {
    throw new TypeError('opacity must be a finite number');
  }
  return getManager().setOpacity(event, opacity) ?? null;
});
ipcMain.handle('window:set-pin', (event, pin: unknown) => {
  if (typeof pin !== 'boolean') {
    throw new TypeError('pin must be a boolean');
  }
  return getManager().setPin(event, pin) ?? null;
});
ipcMain.handle('window:set-collapsed', (event, collapsed: unknown) => {
  if (typeof collapsed !== 'boolean') {
    throw new TypeError('collapsed must be a boolean');
  }
  return getManager().setCollapsed(event, collapsed) ?? null;
});
ipcMain.handle('onboarding:create', (_event, type: unknown) => {
  if (typeof type !== 'string' || !WIDGET_TYPES.includes(type as WidgetType)) {
    throw new TypeError('Unknown widget type');
  }
  const widget = getManager().createWidget(type as WidgetType);
  onboardingWindow?.close();
  return widget;
});

app.whenReady().then(() => {
  const db = initializeAppDatabase();
  const service = createAppDatabaseService(db);
  windowManager = createWindowManager(service);
  registerDisplayRecovery(windowManager);
  createTray();
  windowManager.openVisibleWidgets();
  if (service.widgets.list().length === 0) {
    createOnboardingWindow();
  }
});

app.on('second-instance', () => {
  if (onboardingWindow && !onboardingWindow.isDestroyed()) {
    onboardingWindow.focus();
  } else {
    windowManager?.focusFirstVisible();
  }
});

app.on('before-quit', () => windowManager?.prepareQuit());
app.on('will-quit', () => {
  tray?.destroy();
  tray = undefined;
  closeAppDatabase();
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    windowManager?.openVisibleWidgets();
    if (BrowserWindow.getAllWindows().length === 0) {
      createOnboardingWindow();
    }
  }
});
