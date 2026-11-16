import { ipcMain } from 'electron';
import type { WindowManager } from '../window-manager';
import { isImageDocument } from './note';

export function registerClipHandlers(getManager: () => WindowManager) {
  ipcMain.handle('clip:list', (event) => getManager().getClipsForEvent(event) ?? null);
  ipcMain.handle('clip:create', (event, input: unknown) => {
    const document = typeof input === 'string' ? { text: input, images: [] } : input;
    if (!isImageDocument(document)) throw new TypeError('Invalid clip document');
    return getManager().createClip(event, document) ?? null;
  });
  ipcMain.handle('clip:update', (event, input: unknown) => {
    if (!input || typeof input !== 'object' || !('id' in input) || typeof input.id !== 'string') {
      throw new TypeError('clip update must contain an id');
    }
    const document = 'document' in input ? input.document : undefined;
    if (!isImageDocument(document)) throw new TypeError('Invalid clip document');
    return getManager().updateClip(event, input.id, document) ?? null;
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
  ipcMain.handle('clip:copy', async (event, clipId: unknown) => {
    if (typeof clipId !== 'string') {
      throw new TypeError('clip id must be a string');
    }
    return (await getManager().copyClip(event, clipId)) ?? null;
  });
}
