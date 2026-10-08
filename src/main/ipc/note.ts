import { ipcMain } from 'electron';
import type { WindowManager } from '../window-manager';

export function registerNoteHandlers(getManager: () => WindowManager) {
  ipcMain.handle('widget:save-note', (event, noteText: unknown) => {
    if (typeof noteText !== 'string') {
      throw new TypeError('noteText must be a string');
    }
    return getManager().saveNote(event, noteText) ?? null;
  });
}
