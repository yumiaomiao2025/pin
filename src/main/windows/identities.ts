import { BrowserWindow, type IpcMainInvokeEvent } from 'electron';

export type WidgetWindow = BrowserWindow & { __pinWidgetId?: string };

export type UtilityWindow = BrowserWindow & {
  __pinRole?: 'manager';
  __pinView?: 'manager' | 'settings' | 'colors';
  __pinColorsScope?: 'default' | 'widget';
  __pinColorsWidgetId?: string;
};

export function isWidgetWindow(window: BrowserWindow): window is WidgetWindow {
  return Boolean((window as WidgetWindow).__pinWidgetId);
}

export function isManagerWindow(window: BrowserWindow): window is UtilityWindow {
  return (window as UtilityWindow).__pinRole === 'manager' && (window as UtilityWindow).__pinView === 'manager';
}

export function isSettingsWindow(window: BrowserWindow): window is UtilityWindow {
  return (window as UtilityWindow).__pinRole === 'manager' && (window as UtilityWindow).__pinView === 'settings';
}

export function isColorsWindow(window: BrowserWindow): window is UtilityWindow {
  return (window as UtilityWindow).__pinRole === 'manager' && (window as UtilityWindow).__pinView === 'colors';
}

export const widgetIdForEvent = (event: IpcMainInvokeEvent) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow || !isWidgetWindow(senderWindow)) {
    return undefined;
  }
  return senderWindow.__pinWidgetId;
};

export const isManagerEvent = (event: IpcMainInvokeEvent) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  return Boolean(senderWindow && isManagerWindow(senderWindow));
};

export const isSettingsEvent = (event: IpcMainInvokeEvent) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  return Boolean(senderWindow && isSettingsWindow(senderWindow));
};

export const colorsScopeForEvent = (event: IpcMainInvokeEvent) => {
  const senderWindow = BrowserWindow.fromWebContents(event.sender);
  if (!senderWindow || !isColorsWindow(senderWindow)) {
    return undefined;
  }
  return {
    scope: senderWindow.__pinColorsScope,
    widgetId: senderWindow.__pinColorsWidgetId,
  };
};
