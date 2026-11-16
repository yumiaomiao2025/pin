import { ipcMain } from 'electron';
import type { WindowManager } from '../window-manager';
import { MAX_NOTE_IMAGES, type PinNote } from '../../shared/types';

export function isImageDocument(value: unknown): value is PinNote {
  if (!value || typeof value !== 'object') return false;
  const { text, images } = value as Partial<PinNote>;
  if (typeof text !== 'string' || !Array.isArray(images) || images.length > MAX_NOTE_IMAGES) return false;

  const ids = new Set<string>();
  let lastOffset = -1;
  for (const image of images) {
    if (!image || typeof image.id !== 'string' || !/^[a-f0-9-]{36}$/.test(image.id) || ids.has(image.id)
      || !Number.isInteger(image.offset) || image.offset <= lastOffset || text[image.offset] !== '\n'
      || (image.src !== undefined && typeof image.src !== 'string')) {
      return false;
    }
    ids.add(image.id);
    lastOffset = image.offset;
  }
  return true;
}

export function registerNoteHandlers(getManager: () => WindowManager) {
  ipcMain.handle('widget:get-note', (event) => getManager().getNote(event) ?? null);
  ipcMain.handle('widget:save-note', (event, note: unknown) => {
    if (!isImageDocument(note)) {
      throw new TypeError('Invalid note document');
    }
    return getManager().saveNote(event, note);
  });
}
