import { ipcMain } from 'electron';
import type { WindowManager } from '../window-manager';

export function registerWindowHandlers(getManager: () => WindowManager) {
  ipcMain.handle('widget:get', (event) => getManager().getWidgetForEvent(event) ?? null);
  ipcMain.handle('window:hide', (event) => getManager().hide(event));
  ipcMain.handle('window:set-size', (event, size: unknown) => {
    if (
      !size ||
      typeof size !== 'object' ||
      !('width' in size) ||
      !('height' in size) ||
      typeof size.width !== 'number' ||
      typeof size.height !== 'number' ||
      !Number.isFinite(size.width) ||
      !Number.isFinite(size.height)
    ) {
      throw new TypeError('size must contain finite width and height numbers');
    }
    return getManager().setSize(event, size.width, size.height) ?? null;
  });
  ipcMain.handle('window:get-bounds', (event) => {
    return getManager().getBounds(event) ?? null;
  });
  ipcMain.handle('window:set-position', (event, position: unknown) => {
    if (
      !position ||
      typeof position !== 'object' ||
      !('x' in position) ||
      !('y' in position) ||
      typeof position.x !== 'number' ||
      typeof position.y !== 'number' ||
      !Number.isFinite(position.x) ||
      !Number.isFinite(position.y)
    ) {
      throw new TypeError('position must contain finite x and y numbers');
    }
    return getManager().setPosition(event, position.x, position.y) ?? null;
  });
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
  ipcMain.handle('window:create-same', (event) => {
    const widget = getManager().getWidgetForEvent(event);
    return widget ? getManager().createWidget(widget.type) : null;
  });
  ipcMain.handle('window:open-manager-rename', (event) => getManager().openManagerForRename(event));
  ipcMain.handle('window:delete-current', (event) => getManager().deleteCurrentWidget(event) ?? null);
}
