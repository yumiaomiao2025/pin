import { registerAppHandlers } from './app';
import { registerWindowHandlers } from './window';
import { registerManagerHandlers } from './manager';
import { registerSettingsHandlers } from './settings';
import { registerDeskHandlers } from './desk';
import { registerColorsHandlers } from './colors';
import { registerTodoHandlers } from './todo';
import { registerClipHandlers } from './clip';
import { registerNoteHandlers } from './note';
import { registerOnboardingHandlers } from './onboarding';
import type { WindowManager } from '../window-manager';

export function registerIpcHandlers(getManager: () => WindowManager, closeOnboarding: () => void) {
  registerAppHandlers();
  registerWindowHandlers(getManager);
  registerManagerHandlers(getManager);
  registerSettingsHandlers(getManager);
  registerDeskHandlers(getManager);
  registerColorsHandlers(getManager);
  registerTodoHandlers(getManager);
  registerClipHandlers(getManager);
  registerNoteHandlers(getManager);
  registerOnboardingHandlers(getManager, closeOnboarding);
}
