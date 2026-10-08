import { useState, useEffect } from 'react';
import { type PinSettings } from '../shared/types';
import { DEFAULT_SETTINGS } from './default-settings';
import { type ColorPreview } from '../shared/colors';
import { getWindowContext } from './window-context';
import { Onboarding } from './pages/Onboarding';
import { colorSetStyle, settingsToColorSet, ColorPreviewContext } from './colors/widget-colors';
import { SettingsPanel } from './pages/SettingsPanel';
import { ColorsPanel } from './pages/ColorsPanel';
import { Manager } from './pages/Manager';
import { WidgetApp } from './widgets/WidgetApp';

export function App() {
  const [settings, setSettings] = useState<PinSettings>(DEFAULT_SETTINGS);
  const [colorPreview, setColorPreview] = useState<ColorPreview | null>(null);
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const unsubscribe = window.pinApi.onColorPreviewChanged((preview) => {
      receivedEvent = true;
      if (active) setColorPreview(preview);
    });
    void window.pinApi.getColorPreview().then((preview) => {
      if (active && !receivedEvent) setColorPreview(preview);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    let active = true;
    const applySettings = (settings: PinSettings) => {
      if (active) {
        setSettings(settings);
        document.documentElement.style.fontSize = `${settings.fontSize}px`;
      }
    };
    const unsubscribe = window.pinApi.onSettingsChanged(applySettings);
    void window.pinApi.getSettings().then(applySettings);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const context = getWindowContext();
  if (context.role === 'onboarding') {
    return <Onboarding />;
  }
  if (context.role === 'manager' || context.role === 'settings' || context.role === 'colors') {
    const page = context.role === 'manager' ? context.page : context.role;
    return (
      <div className="utility-themed" style={colorSetStyle(colorPreview?.colors ?? settingsToColorSet(settings))}>
        {page === 'settings' ? <SettingsPanel /> : page === 'colors' ? <ColorsPanel /> : <Manager />}
      </div>
    );
  }
  return <ColorPreviewContext.Provider value={colorPreview}><WidgetApp /></ColorPreviewContext.Provider>;
}
