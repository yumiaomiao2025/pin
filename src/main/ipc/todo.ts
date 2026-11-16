import { ipcMain } from 'electron';
import type { WindowManager } from '../window-manager';
import type { PinTodoUpdate } from '../../shared/types';
import { isImageDocument } from './note';

export function registerTodoHandlers(getManager: () => WindowManager) {
  ipcMain.handle('todo:list', (event) => getManager().getTodosForEvent(event) ?? null);
  ipcMain.handle('todo:create', (event, input: unknown) => {
    const document = typeof input === 'string' ? { text: input, images: [] } : input;
    if (!isImageDocument(document)) {
      throw new TypeError('Invalid todo document');
    }
    return getManager().createTodo(event, document) ?? null;
  });
  ipcMain.handle('todo:update', (event, input: unknown) => {
    if (!input || typeof input !== 'object' || !('id' in input) || typeof input.id !== 'string') {
      throw new TypeError('todo update must contain an id');
    }
    const patch: PinTodoUpdate = {};
    if ('text' in input || 'images' in input) {
      const document = { text: 'text' in input ? input.text : undefined, images: 'images' in input ? input.images : [] };
      if (!isImageDocument(document)) {
        throw new TypeError('Invalid todo document');
      }
      patch.text = document.text;
      patch.images = document.images;
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
}
