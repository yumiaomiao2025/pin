import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('pinApi', {
  ping: () => ipcRenderer.invoke('app:ping'),
  getWidget: () => ipcRenderer.invoke('widget:get'),
  saveNote: (noteText: string) => ipcRenderer.invoke('widget:save-note', noteText),
  hideWindow: () => ipcRenderer.invoke('window:hide'),
  setOpacity: (opacity: number) => ipcRenderer.invoke('window:set-opacity', opacity),
  setPin: (pin: boolean) => ipcRenderer.invoke('window:set-pin', pin),
  setCollapsed: (collapsed: boolean) => ipcRenderer.invoke('window:set-collapsed', collapsed),
  createWidget: (type: 'note' | 'todo' | 'clip' | 'desk') =>
    ipcRenderer.invoke('onboarding:create', type),
});
