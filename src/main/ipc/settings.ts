import { ipcMain } from 'electron';
import { type UpdateSettingsInput } from '../database/repositories';
import type { WindowManager } from '../window-manager';

export function registerSettingsHandlers(getManager: () => WindowManager) {
  ipcMain.handle('settings:open', () => {
    getManager().openSettings();
    return true;
  });
  ipcMain.handle('settings:hide', (event) => getManager().hideSettings(event));
  ipcMain.handle('settings:get', () => getManager().getSettings());
  ipcMain.handle('settings:update', (event, input: unknown) => {
    if (!input || typeof input !== 'object') {
      throw new TypeError('settings update must be an object');
    }
    const values = input as Record<string, unknown>;
    const patch: UpdateSettingsInput = {};
    if ('maxLines' in values && values.maxLines !== undefined) {
      if (typeof values.maxLines !== 'number' || !Number.isInteger(values.maxLines) || values.maxLines < 0 || values.maxLines > 3) {
        throw new TypeError('maxLines must be an integer from 0 to 3');
      }
      patch.maxLines = values.maxLines;
    }
    if ('fontSize' in values && values.fontSize !== undefined) {
      if (typeof values.fontSize !== 'number' || !Number.isInteger(values.fontSize) || values.fontSize < 11 || values.fontSize > 18) {
        throw new TypeError('fontSize must be an integer from 11 to 18');
      }
      patch.fontSize = values.fontSize;
    }
    if ('defaultOpacity' in values && values.defaultOpacity !== undefined) {
      if (typeof values.defaultOpacity !== 'number' || !Number.isInteger(values.defaultOpacity) || values.defaultOpacity < 5 || values.defaultOpacity > 100) {
        throw new TypeError('defaultOpacity must be an integer from 5 to 100');
      }
      patch.defaultOpacity = values.defaultOpacity;
    }
    (['hoverFull', 'opacityBar', 'pinAll', 'autostart', 'snap'] as const).forEach((key) => {
      if (key in values && values[key] !== undefined) {
        if (typeof values[key] !== 'boolean') {
          throw new TypeError(`${key} must be a boolean`);
        }
        patch[key] = values[key];
      }
    });
    if (Object.keys(patch).length === 0) {
      throw new TypeError('settings update is empty');
    }
    return getManager().updateSettings(event, patch) ?? null;
  });
  ipcMain.handle('settings:reset', (event) => getManager().resetSettings(event) ?? null);
}
