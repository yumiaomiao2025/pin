import { ipcMain } from 'electron';
import { WIDGET_TYPES, type WidgetType } from '../database/schema';
import type { WindowManager } from '../window-manager';

export function registerOnboardingHandlers(getManager: () => WindowManager, closeOnboarding: () => void) {
  ipcMain.handle('onboarding:create', (_event, type: unknown) => {
    if (typeof type !== 'string' || !WIDGET_TYPES.includes(type as WidgetType)) {
      throw new TypeError('Unknown widget type');
    }
    const widget = getManager().createWidget(type as WidgetType);
    closeOnboarding();
    return widget;
  });
}
