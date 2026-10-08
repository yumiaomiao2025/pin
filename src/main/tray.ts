import { app, Menu, nativeImage, Tray } from 'electron';
import { type WidgetType, WIDGET_TYPES } from './database/schema';
import type { WindowManager } from './window-manager';

const WIDGET_OPTIONS_LABELS: Record<WidgetType, string> = {
  note: '新便签',
  todo: '新待办清单',
  clip: '新剪贴板',
  desk: '新三合一',
};

export function createTray(getManager: () => WindowManager | undefined): Tray {
  const bitmap = Buffer.alloc(16 * 16 * 4);
  for (let index = 0; index < bitmap.length; index += 4) {
    bitmap[index] = 17;
    bitmap[index + 1] = 17;
    bitmap[index + 2] = 17;
    bitmap[index + 3] = 255;
  }
  const tray = new Tray(nativeImage.createFromBitmap(bitmap, { width: 16, height: 16, scaleFactor: 1 }));
  tray.setToolTip('Pin');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: '新建',
        submenu: WIDGET_TYPES.map((type) => ({
          label: WIDGET_OPTIONS_LABELS[type],
          click: () => getManager()?.createWidget(type),
        })),
      },
      { type: 'separator' },
      {
        label: '管理面板…',
        click: () => getManager()?.openManager(),
      },
      {
        label: '全部隐藏',
        click: () => getManager()?.hideAllWidgets(),
      },
      {
        label: '全部显示',
        click: () => getManager()?.showAllWidgets(),
      },
      {
        label: '设置',
        click: () => getManager()?.openSettings(),
      },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]),
  );
  tray.on('double-click', () => getManager()?.openManager());
  return tray;
}
