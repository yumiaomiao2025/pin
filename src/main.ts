import started from 'electron-squirrel-startup';
import path from 'node:path';
import { app, BrowserWindow, type Tray } from 'electron';
import { type WindowManager, createWindowManager, registerDisplayRecovery } from './main/window-manager';
import { initializeAppDatabase, closeAppDatabase } from './main/database/app-database';
import { createAppDatabaseService } from './main/database/app-service';
import { registerIpcHandlers } from './main/ipc/register';
import { createTray } from './main/tray';

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

const installDevToolsShortcut = () => {
  if (!MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    return;
  }
  app.on('browser-window-created', (_event, window) => {
    window.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown' || input.key !== 'F12') {
        return;
      }
      event.preventDefault();
      if (window.webContents.isDevToolsOpened()) {
        window.webContents.closeDevTools();
      } else {
        window.webContents.openDevTools({ mode: 'detach' });
      }
    });
  });
};

installDevToolsShortcut();

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
    roundedCorners: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
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

registerIpcHandlers(getManager, () => { onboardingWindow?.close(); });

app.whenReady().then(() => {
  const db = initializeAppDatabase();
  const service = createAppDatabaseService(db);
  windowManager = createWindowManager(service);
  registerDisplayRecovery(windowManager);
  if (!tray) tray = createTray(() => windowManager);
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
