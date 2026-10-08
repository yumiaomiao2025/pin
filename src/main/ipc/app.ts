import { ipcMain, app } from 'electron';

export function registerAppHandlers() {
  ipcMain.handle('app:ping', () => ({
    ok: true,
    version: app.getVersion(),
  }));
}
