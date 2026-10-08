import { ipcMain } from 'electron';
import type { WindowManager } from '../window-manager';

export function registerTodoHandlers(getManager: () => WindowManager) {
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
}
