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
ipcMain.handle('widget:save-note', (event, noteText: unknown) => {
  if (typeof noteText !== 'string') {
    throw new TypeError('noteText must be a string');
  }
  return getManager().saveNote(event, noteText) ?? null;
});
ipcMain.handle('window:hide', (event) => getManager().hide(event));
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
