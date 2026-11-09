import { app } from 'electron';
import path from 'node:path';

export function pinIconPath() {
  const directory = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), 'assets');
  return path.join(directory, 'pin.ico');
}
