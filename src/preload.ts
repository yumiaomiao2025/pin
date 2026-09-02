import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('pinApi', {
  ping: () => ipcRenderer.invoke('app:ping'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  getWidget: () => ipcRenderer.invoke('widget:get'),
  openManager: () => ipcRenderer.invoke('manager:open'),
  hideManager: () => ipcRenderer.invoke('manager:hide'),
  listManagedWidgets: () => ipcRenderer.invoke('manager:list-widgets'),
  setManagedWidgetHidden: (id: string, hidden: boolean) =>
    ipcRenderer.invoke('manager:set-hidden', { id, hidden }),
  setManagedWidgetPin: (id: string, pin: boolean) => ipcRenderer.invoke('manager:set-pin', { id, pin }),
  setAllManagedWidgetsHidden: (hidden: boolean) => ipcRenderer.invoke('manager:set-all-hidden', hidden),
  createManagedWidget: (type: 'note' | 'todo' | 'clip' | 'desk') =>
    ipcRenderer.invoke('manager:create-widget', type),
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
  setSize: (width: number, height: number) => ipcRenderer.invoke('window:set-size', { width, height }),
  setOpacity: (opacity: number) => ipcRenderer.invoke('window:set-opacity', opacity),
  setPin: (pin: boolean) => ipcRenderer.invoke('window:set-pin', pin),
  setCollapsed: (collapsed: boolean) => ipcRenderer.invoke('window:set-collapsed', collapsed),
  createWidget: (type: 'note' | 'todo' | 'clip' | 'desk') =>
    ipcRenderer.invoke('onboarding:create', type),
});
