import { ipcMain } from 'electron';
import type { WindowManager } from '../window-manager';

export function registerClipHandlers(getManager: () => WindowManager) {
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
}
