import { screen } from 'electron';
import type { WindowManager } from '../window-manager';

export function registerDisplayRecovery(manager: WindowManager) {
  screen.on('display-added', () => manager.recoverWidgetDisplays());
  screen.on('display-removed', () => manager.recoverWidgetDisplays());
  screen.on('display-metrics-changed', (_event, _display, changedMetrics) => {
    if (changedMetrics.some((metric) => metric === 'bounds' || metric === 'workArea' || metric === 'scaleFactor')) {
      manager.recoverWidgetDisplays();
    }
  });
}
