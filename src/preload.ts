import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('pinApi', {
  ping: () => ipcRenderer.invoke('app:ping'),
  getWidget: () => ipcRenderer.invoke('widget:get'),
  listTodos: () => ipcRenderer.invoke('todo:list'),
  createTodo: (text: string) => ipcRenderer.invoke('todo:create', text),
  updateTodo: (id: string, patch: { text?: string; done?: boolean }) =>
    ipcRenderer.invoke('todo:update', { id, ...patch }),
  deleteTodo: (id: string) => ipcRenderer.invoke('todo:delete', id),
  restoreTodo: () => ipcRenderer.invoke('todo:restore'),
  reorderTodos: (orderedIds: string[]) => ipcRenderer.invoke('todo:reorder', orderedIds),
  saveNote: (noteText: string) => ipcRenderer.invoke('widget:save-note', noteText),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  setSize: (width: number, height: number) => ipcRenderer.invoke('window:set-size', { width, height }),
  setOpacity: (opacity: number) => ipcRenderer.invoke('window:set-opacity', opacity),
  setPin: (pin: boolean) => ipcRenderer.invoke('window:set-pin', pin),
  setCollapsed: (collapsed: boolean) => ipcRenderer.invoke('window:set-collapsed', collapsed),
  createWidget: (type: 'note' | 'todo' | 'clip' | 'desk') =>
    ipcRenderer.invoke('onboarding:create', type),
});
