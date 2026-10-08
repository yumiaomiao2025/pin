import { ipcMain } from 'electron';
import { normalizeKitColors, type ColorSet } from '../../shared/colors';
import type { WindowManager } from '../window-manager';

export function registerColorsHandlers(getManager: () => WindowManager) {
  ipcMain.handle('colors:open-default', () => {
    getManager().openColors('default');
    return true;
  });
  ipcMain.handle('colors:open-widget', (event) => getManager().openWidgetColors(event));
  ipcMain.handle('colors:get-context', (event) => getManager().getColorContext(event) ?? null);
  ipcMain.handle('colors:apply-preset', (event, presetId: unknown) => {
    if (typeof presetId !== 'string') {
      throw new TypeError('preset id must be a string');
    }
    const context = getManager().getColorContext(event);
    if (!context) {
      return null;
    }
    return context.scope === 'widget'
      ? getManager().applyWidgetPreset(event, presetId) ?? null
      : getManager().applyDefaultPreset(event, presetId) ?? null;
  });
  ipcMain.handle('colors:set-widget-follow-default', (event, followsDefault: unknown) => {
    if (typeof followsDefault !== 'boolean') {
      throw new TypeError('followsDefault must be a boolean');
    }
    return getManager().setWidgetFollowDefault(event, followsDefault) ?? null;
  });
  ipcMain.handle('colors:list-kits', (event) => getManager().listColorKits(event) ?? null);
  function parseColorKitInput(input: unknown) {
    if (!input || typeof input !== 'object' || !('name' in input) || typeof input.name !== 'string' || !input.name.trim()) {
      throw new TypeError('kit must contain a nonempty name');
    }
    if (!('colors' in input) || !input.colors || typeof input.colors !== 'object') {
      throw new TypeError('kit must contain colors');
    }
    return { name: input.name.trim(), colors: parseColorKitColors(input.colors) };
  }
  function parseColorKitColors(input: object) {
    const colors = input as Record<string, unknown>;
    for (const part of ['paper', 'accent', 'ink']) {
      if (typeof colors[part] !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(colors[part] as string)) {
        throw new TypeError(`${part} must be a six-digit hex color`);
      }
    }
    return normalizeKitColors(colors as unknown as ColorSet);
  }
  ipcMain.handle('colors:preview', (event, input: unknown) => {
    if (!input || typeof input !== 'object') throw new TypeError('preview must contain colors');
    return getManager().previewColorKit(event, parseColorKitColors(input));
  });
  ipcMain.handle('colors:end-preview', (event) => getManager().endColorPreview(event));
  ipcMain.handle('colors:get-preview', () => getManager().getColorPreview());
  ipcMain.handle('colors:create-kit', (event, input: unknown) => {
    const { name, colors } = parseColorKitInput(input);
    return getManager().createColorKit(event, name, colors) ?? null;
  });
  ipcMain.handle('colors:update-kit', (event, input: unknown) => {
    const { name, colors } = parseColorKitInput(input);
    if (!input || typeof input !== 'object' || !('id' in input) || typeof input.id !== 'string') {
      throw new TypeError('kit update must contain an id');
    }
    return getManager().updateColorKit(event, input.id, name, colors) ?? null;
  });
  ipcMain.handle('colors:rename-kit', (event, input: unknown) => {
    if (
      !input ||
      typeof input !== 'object' ||
      !('id' in input) ||
      typeof input.id !== 'string' ||
      !('name' in input) ||
      typeof input.name !== 'string'
    ) {
      throw new TypeError('kit rename must contain id and name');
    }
    return getManager().renameColorKit(event, input.id, input.name) ?? null;
  });
  ipcMain.handle('colors:delete-kit', (event, kitId: unknown) => {
    if (typeof kitId !== 'string') {
      throw new TypeError('kit id must be a string');
    }
    return getManager().deleteColorKit(event, kitId) ?? null;
  });
  ipcMain.handle('colors:apply-kit', (event, kitId: unknown) => {
    if (typeof kitId !== 'string') {
      throw new TypeError('kit id must be a string');
    }
    return getManager().applyColorKit(event, kitId) ?? null;
  });
  ipcMain.handle('colors:hide', (event) => getManager().hideColors(event));
}
