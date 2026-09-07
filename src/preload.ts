import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('pinApi', {
  ping: () => ipcRenderer.invoke('app:ping'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke('settings:update', patch),
  resetSettings: () => ipcRenderer.invoke('settings:reset'),
  openDefaultColors: () => ipcRenderer.invoke('colors:open-default'),
  openWidgetColors: () => ipcRenderer.invoke('colors:open-widget'),
  getColorContext: () => ipcRenderer.invoke('colors:get-context'),
  applyColorPreset: (presetId: string) => ipcRenderer.invoke('colors:apply-preset', presetId),
  setWidgetFollowDefault: (followsDefault: boolean) =>
    ipcRenderer.invoke('colors:set-widget-follow-default', followsDefault),
  updateColorParts: (patch: Record<string, string | null>) =>
    ipcRenderer.invoke('colors:update-parts', patch),
  applyPrimaryColor: (color: string) => ipcRenderer.invoke('colors:apply-primary', color),
  listColorKits: () => ipcRenderer.invoke('colors:list-kits'),
  createColorKit: (name: string) => ipcRenderer.invoke('colors:create-kit', name),
  renameColorKit: (id: string, name: string) => ipcRenderer.invoke('colors:rename-kit', { id, name }),
  deleteColorKit: (id: string) => ipcRenderer.invoke('colors:delete-kit', id),
  applyColorKit: (id: string) => ipcRenderer.invoke('colors:apply-kit', id),
  hideColors: () => ipcRenderer.invoke('colors:hide'),
  onSettingsChanged: (listener: (settings: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, settings: unknown) => listener(settings);
    ipcRenderer.on('settings:changed', handler);
    return () => ipcRenderer.removeListener('settings:changed', handler);
  },
  onWidgetChanged: (listener: (widget: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, widget: unknown) => listener(widget);
    ipcRenderer.on('widget:changed', handler);
    return () => ipcRenderer.removeListener('widget:changed', handler);
  },
  onWidgetDeleted: (listener: (widgetId: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, widgetId: unknown) => listener(widgetId);
    ipcRenderer.on('widget:deleted', handler);
    return () => ipcRenderer.removeListener('widget:deleted', handler);
  },
  getWidget: () => ipcRenderer.invoke('widget:get'),
  openManager: () => ipcRenderer.invoke('manager:open'),
  hideManager: () => ipcRenderer.invoke('manager:hide'),
  openSettings: () => ipcRenderer.invoke('settings:open'),
  hideSettings: () => ipcRenderer.invoke('settings:hide'),
  listManagedWidgets: () => ipcRenderer.invoke('manager:list-widgets'),
  setManagedWidgetHidden: (id: string, hidden: boolean) =>
    ipcRenderer.invoke('manager:set-hidden', { id, hidden }),
  setManagedWidgetPin: (id: string, pin: boolean) => ipcRenderer.invoke('manager:set-pin', { id, pin }),
  setAllManagedWidgetsHidden: (hidden: boolean) => ipcRenderer.invoke('manager:set-all-hidden', hidden),
  createManagedWidget: (type: 'note' | 'todo' | 'clip' | 'desk') =>
    ipcRenderer.invoke('manager:create-widget', type),
  renameManagedWidget: (id: string, title: string) => ipcRenderer.invoke('manager:rename-widget', { id, title }),
  deleteManagedWidget: (id: string) => ipcRenderer.invoke('manager:delete-widget', id),
  restoreManagedWidget: () => ipcRenderer.invoke('manager:restore-widget'),
  setActiveTab: (activeTab: 'note' | 'todo' | 'clip') => ipcRenderer.invoke('desk:set-tab', activeTab),
  listTodos: () => ipcRenderer.invoke('todo:list'),
  createTodo: (text: string) => ipcRenderer.invoke('todo:create', text),
  updateTodo: (id: string, patch: { text?: string; done?: boolean }) =>
    ipcRenderer.invoke('todo:update', { id, ...patch }),
  deleteTodo: (id: string) => ipcRenderer.invoke('todo:delete', id),
  restoreTodo: () => ipcRenderer.invoke('todo:restore'),
  reorderTodos: (orderedIds: string[]) => ipcRenderer.invoke('todo:reorder', orderedIds),
  listClips: () => ipcRenderer.invoke('clip:list'),
  createClip: (text: string) => ipcRenderer.invoke('clip:create', text),
  updateClip: (id: string, text: string) => ipcRenderer.invoke('clip:update', { id, text }),
  deleteClip: (id: string) => ipcRenderer.invoke('clip:delete', id),
  restoreClip: () => ipcRenderer.invoke('clip:restore'),
  reorderClips: (orderedIds: string[]) => ipcRenderer.invoke('clip:reorder', orderedIds),
  copyClip: (id: string) => ipcRenderer.invoke('clip:copy', id),
  saveNote: (noteText: string) => ipcRenderer.invoke('widget:save-note', noteText),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  getWindowBounds: () => ipcRenderer.invoke('window:get-bounds'),
  setPosition: (x: number, y: number) => ipcRenderer.invoke('window:set-position', { x, y }),
  setSize: (width: number, height: number) => ipcRenderer.invoke('window:set-size', { width, height }),
  setOpacity: (opacity: number) => ipcRenderer.invoke('window:set-opacity', opacity),
  setPin: (pin: boolean) => ipcRenderer.invoke('window:set-pin', pin),
  setCollapsed: (collapsed: boolean) => ipcRenderer.invoke('window:set-collapsed', collapsed),
  createSameWidget: () => ipcRenderer.invoke('window:create-same'),
  openManagerRename: () => ipcRenderer.invoke('window:open-manager-rename'),
  deleteCurrentWidget: () => ipcRenderer.invoke('window:delete-current'),
  createWidget: (type: 'note' | 'todo' | 'clip' | 'desk') =>
    ipcRenderer.invoke('onboarding:create', type),
});
