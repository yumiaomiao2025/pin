import { ipcMain } from 'electron';
import { WIDGET_TYPES, type WidgetType } from '../database/schema';
import type { WindowManager } from '../window-manager';

export function registerManagerHandlers(getManager: () => WindowManager) {
  ipcMain.handle('manager:open', () => {
    getManager().openManager();
    return true;
  });
  ipcMain.handle('manager:hide', (event) => getManager().hideManager(event));
  ipcMain.handle('manager:list-widgets', (event) => getManager().getWidgetsForEvent(event) ?? null);
  ipcMain.handle('manager:set-hidden', (event, input: unknown) => {
    if (
      !input ||
      typeof input !== 'object' ||
      !('id' in input) ||
      typeof input.id !== 'string' ||
      !('hidden' in input) ||
      typeof input.hidden !== 'boolean'
    ) {
      throw new TypeError('widget visibility update must contain id and hidden');
    }
    return getManager().setWidgetHidden(event, input.id, input.hidden) ?? null;
  });
  ipcMain.handle('manager:set-pin', (event, input: unknown) => {
    if (
      !input ||
      typeof input !== 'object' ||
      !('id' in input) ||
      typeof input.id !== 'string' ||
      !('pin' in input) ||
      typeof input.pin !== 'boolean'
    ) {
      throw new TypeError('widget pin update must contain id and pin');
    }
    return getManager().setWidgetPin(event, input.id, input.pin) ?? null;
  });
  ipcMain.handle('manager:set-all-hidden', (event, hidden: unknown) => {
    if (typeof hidden !== 'boolean') {
      throw new TypeError('all widget visibility must be a boolean');
    }
    return getManager().setAllWidgetsHidden(event, hidden) ?? null;
  });
  ipcMain.handle('manager:create-widget', (event, type: unknown) => {
    if (typeof type !== 'string' || !WIDGET_TYPES.includes(type as WidgetType)) {
      throw new TypeError('Unknown widget type');
    }
    return getManager().createWidgetForEvent(event, type as WidgetType) ?? null;
  });
  ipcMain.handle('manager:rename-widget', (event, input: unknown) => {
    if (
      !input ||
      typeof input !== 'object' ||
      !('id' in input) ||
      typeof input.id !== 'string' ||
      !('title' in input) ||
      typeof input.title !== 'string'
    ) {
      throw new TypeError('widget rename must contain id and title');
    }
    return getManager().renameWidget(event, input.id, input.title) ?? null;
  });
  ipcMain.handle('manager:delete-widget', (event, widgetId: unknown) => {
    if (typeof widgetId !== 'string') {
      throw new TypeError('widget id must be a string');
    }
    return getManager().deleteWidget(event, widgetId) ?? null;
  });
  ipcMain.handle('manager:restore-widget', (event) => getManager().restoreWidget(event) ?? null);
}
