import { type PinSettings } from '../../shared/types';
import { useState, useEffect } from 'react';

type WindowDisplaySettings = Pick<PinSettings, 'maxLines' | 'hoverFull' | 'opacityBar'>;

const DEFAULT_TODO_SETTINGS: WindowDisplaySettings = {
  maxLines: 0,
  hoverFull: true,
  opacityBar: true,
};

export function useWindowDisplaySettings() {
  const [settings, setSettings] = useState<WindowDisplaySettings>(DEFAULT_TODO_SETTINGS);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.pinApi.onSettingsChanged((nextSettings) => {
      if (active) {
        setSettings(nextSettings);
      }
    });
    void window.pinApi.getSettings().then((nextSettings) => {
      if (active) {
        setSettings(nextSettings);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return settings;
}
