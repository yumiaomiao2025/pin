import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

import { createAppDatabaseService } from './main/database/app-service';
import { closeAppDatabase, initializeAppDatabase } from './main/database/app-database';
import { WIDGET_TYPES, type WidgetType } from './main/database/schema';
import {
  createWindowManager,
  registerDisplayRecovery,
  type WindowManager,
} from './main/window-manager';

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
ipcMain.handle('settings:get', () => getManager().getSettings());
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
app.on('will-quit', closeAppDatabase);

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
