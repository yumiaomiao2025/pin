import type * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { type PinSettings, type PinCustomKit, type PinSettingsUpdate } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../default-settings';
import { COLOR_PRESETS, colorSetEquals } from '../../shared/colors';
import { OverlayScrollArea } from '../components/OverlayScrollArea';
import { ColorSwatches } from '../components/ColorSwatches';
import { RangeControl } from '../components/RangeControl';

function SettingsTitleBar({ onBack }: { onBack: () => void }) {
  return (
    <header className="settings-titlebar">
      <span className="type-label">SETTINGS</span>
      <button
        aria-label="返回窗口管理"
        className="title-action title-action--icon"
        onClick={onBack}
        title="返回窗口管理"
        type="button"
      >
        <ChevronLeft aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
      </button>
    </header>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="settings-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function SettingsToggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="settings-row">
      <span>{label}</span>
      <button
        aria-pressed={checked}
        className={checked ? 'settings-toggle settings-toggle--on' : 'settings-toggle'}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        type="button"
      >
        <span aria-hidden="true" className="settings-toggle-knob" />
      </button>
    </div>
  );
}

function SettingsSegmented<T extends string>({
  disabled,
  options,
  value,
  onChange,
}: {
  disabled: boolean;
  options: Array<{ id: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="settings-segmented">
      {options.map((option) => (
        <button
          aria-pressed={value === option.id}
          className={value === option.id ? 'settings-segment settings-segment--active' : 'settings-segment'}
          disabled={disabled}
          key={option.id}
          onClick={() => onChange(option.id)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsPanel() {
  const [settings, setSettings] = useState<PinSettings>(DEFAULT_SETTINGS);
  const [kits, setKits] = useState<PinCustomKit[]>([]);
  const [busy, setBusy] = useState(false);

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
    void window.pinApi.listColorKits().then((nextKits) => {
      if (active) setKits(nextKits ?? []);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const updateSettings = async (patch: PinSettingsUpdate) => {
    setBusy(true);
    try {
      const updated = await window.pinApi.updateSettings(patch);
      if (updated) {
        setSettings(updated);
      }
    } finally {
      setBusy(false);
    }
  };

  const resetSettings = async () => {
    setBusy(true);
    try {
      const updated = await window.pinApi.resetSettings();
      if (updated) {
        setSettings(updated);
      }
    } finally {
      setBusy(false);
    }
  };

  const currentPreset = COLOR_PRESETS.find((preset) => colorSetEquals(preset, {
    paper: settings.defaultPaperColor,
    ink: settings.defaultInkColor,
    title: settings.defaultTitleColor,
    accent: settings.defaultAccentColor,
    spine: settings.defaultSpineColor,
    shadow: settings.defaultShadowColor,
  }));
  const currentKit = kits.find((kit) => kit.id === settings.defaultColorKitId);

  const updateDefaultOpacity = (defaultOpacity: number) => {
    setSettings((current) => ({ ...current, defaultOpacity }));
    void window.pinApi.updateSettings({ defaultOpacity }).then((updated) => {
      if (updated) {
        setSettings(updated);
      }
    });
  };

  const updateFontSize = (fontSize: number) => {
    setSettings((current) => ({ ...current, fontSize }));
    void window.pinApi.updateSettings({ fontSize }).then((updated) => {
      if (updated) {
        setSettings(updated);
      }
    });
  };

  return (
    <main className="app settings-app">
      <SettingsTitleBar onBack={() => void window.pinApi.openManager()} />
      <OverlayScrollArea className="settings-scroll">
        <SettingsSection title="WINDOW">
          <SettingsToggle checked={settings.pinAll} disabled={busy} label="全部始终置顶" onChange={(pinAll) => void updateSettings({ pinAll })} />
          <SettingsToggle checked={settings.snap} disabled={busy} label="吸附屏幕边缘" onChange={(snap) => void updateSettings({ snap })} />
          <SettingsToggle checked={settings.hoverFull} disabled={busy} label="溢出悬停显示全文" onChange={(hoverFull) => void updateSettings({ hoverFull })} />
        </SettingsSection>
        <SettingsSection title="APPEARANCE">
          <button className="settings-kit-row" onClick={() => void window.pinApi.openDefaultColors()} type="button">
            <span>配色套装</span>
            <span className="settings-kit-value">
              <ColorSwatches colors={{ paper: settings.defaultPaperColor, accent: settings.defaultAccentColor, ink: settings.defaultInkColor }} />
              <span>{currentKit?.name ?? currentPreset?.name ?? '自定义'}</span>
              <ChevronRight aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
            </span>
          </button>
          <div className="settings-row settings-range-row">
            <label htmlFor="default-opacity">新窗口透明度</label>
            <RangeControl
              aria-label="新窗口透明度"
              disabled={busy}
              id="default-opacity"
              maximum={100}
              minimum={5}
              onChange={updateDefaultOpacity}
              value={settings.defaultOpacity}
            />
            <output>{settings.defaultOpacity}%</output>
          </div>
          <SettingsToggle checked={settings.opacityBar} disabled={busy} label="窗口内显示透明度条" onChange={(opacityBar) => void updateSettings({ opacityBar })} />
          <p className="settings-hint">关掉透明度条后，它会出现在窗口右键菜单里</p>
        </SettingsSection>
        <SettingsSection title="TEXT">
          <div className="settings-row settings-range-row">
            <label htmlFor="font-size">字体大小</label>
            <RangeControl
              aria-label="字体大小"
              disabled={busy}
              id="font-size"
              maximum={18}
              minimum={11}
              onChange={updateFontSize}
              step={1}
              value={settings.fontSize}
            />
            <output>{settings.fontSize}px</output>
          </div>
          <div className="settings-row settings-choice-row">
            <span>条目最多显示</span>
            <SettingsSegmented
              disabled={busy}
              onChange={(maxLines) => void updateSettings({ maxLines: Number(maxLines) })}
              options={[{ id: '1', label: '1 行' }, { id: '2', label: '2 行' }, { id: '3', label: '3 行' }, { id: '0', label: '不限' }]}
              value={String(settings.maxLines) as '0' | '1' | '2' | '3'}
            />
          </div>
        </SettingsSection>
        <SettingsSection title="STARTUP">
          <SettingsToggle checked={settings.autostart} disabled={busy} label="开机自启" onChange={(autostart) => void updateSettings({ autostart })} />
        </SettingsSection>
      </OverlayScrollArea>
      <footer className="settings-footer">
        <span>v0.3</span>
        <button disabled={busy} onClick={() => void resetSettings()} type="button">RESET</button>
      </footer>
    </main>
  );
}
