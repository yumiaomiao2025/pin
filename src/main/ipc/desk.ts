import { ipcMain } from 'electron';
import { DESK_TABS, type DeskTab } from '../database/schema';
import type { WindowManager } from '../window-manager';

export function registerDeskHandlers(getManager: () => WindowManager) {
  ipcMain.handle('desk:set-tab', (event, activeTab: unknown) => {
    if (typeof activeTab !== 'string' || !DESK_TABS.includes(activeTab as DeskTab)) {
      throw new TypeError('Unknown desk tab');
    }
    return getManager().setActiveTab(event, activeTab as DeskTab) ?? null;
  });
}
