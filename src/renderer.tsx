import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import './styles/global.scss';
import { COLOR_PRESETS, colorSetEquals, deriveColorVars, mixColor } from './shared/colors';

type WidgetType = PinWidget['type'];

function getWindowContext() {
  const params = new URLSearchParams(window.location.search);
  return {
    role: params.get('role') ?? 'unknown',
    id: params.get('id') ?? 'unknown',
    scope: params.get('scope') ?? 'default',
    renameId: params.get('renameId'),
    widgetId: params.get('widgetId'),
  };
}

const WIDGET_OPTIONS: Array<{ type: WidgetType; label: string }> = [
  { type: 'note', label: '新便签' },
  { type: 'todo', label: '新待办清单' },
  { type: 'clip', label: '新剪贴板' },
  { type: 'desk', label: '新三合一' },
];

const MANAGER_FILTER_OPTIONS: Array<{ type: WidgetType | 'all'; label: string }> = [
  { type: 'all', label: 'ALL' },
  { type: 'note', label: 'NOTE' },
  { type: 'todo', label: 'TODO' },
  { type: 'clip', label: 'CLIP' },
  { type: 'desk', label: 'DESK' },
];

function widgetDisplayName(widget: PinWidget) {
  return widget.title.trim() || widget.type.toUpperCase();
}

function effectiveTheme(settings: PinSettings) {
  return settings.effectiveTheme;
}

function widgetColorStyle(widget: PinWidget): React.CSSProperties {
  const colors = deriveColorVars({
    paper: widget.paperColor,
    ink: widget.inkColor,
    title: widget.titleColor,
    accent: widget.accentColor,
    spine: widget.spineColor,
    shadow: widget.shadowColor,
  });
  return {
    '--widget-paper': colors.paper,
    '--widget-ink': colors.ink,
    '--widget-title': colors.title,
    '--widget-accent': colors.accent,
    '--widget-spine': colors.spine ?? 'transparent',
    '--widget-shadow': colors.shadow,
    '--widget-sub': colors.sub,
    '--widget-soft': colors.soft,
    boxShadow: colors.spine
      ? `inset 8px 0 0 ${colors.spine}, 8px 8px 0 ${colors.shadow}`
      : `8px 8px 0 ${colors.shadow}`,
  } as React.CSSProperties;
}

type WindowDisplaySettings = Pick<PinSettings, 'maxLines' | 'hoverFull' | 'scrollbar' | 'opacityBar'>;

const DEFAULT_TODO_SETTINGS: WindowDisplaySettings = {
  maxLines: 0,
  hoverFull: true,
  scrollbar: 'overlay',
  opacityBar: true,
};

function useWindowDisplaySettings() {
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

function useWidgetUpdates(setWidget: React.Dispatch<React.SetStateAction<PinWidget>>) {
  useEffect(() => {
    const unsubscribe = window.pinApi.onWidgetChanged((nextWidget) => {
      setWidget((current) => (current.id === nextWidget.id ? nextWidget : current));
    });
    return unsubscribe;
  }, [setWidget]);
}

function compareTodos(left: PinTodo, right: PinTodo) {
  return left.sortOrder - right.sortOrder || left.createdAt - right.createdAt || left.id.localeCompare(right.id);
}

function compareClips(left: PinClipItem, right: PinClipItem) {
  return left.sortOrder - right.sortOrder || left.createdAt - right.createdAt || left.id.localeCompare(right.id);
}

function Onboarding() {
  const [creating, setCreating] = useState<WidgetType | null>(null);

  const createWidget = async (type: WidgetType) => {
    setCreating(type);
    try {
      await window.pinApi.createWidget(type);
    } finally {
      setCreating(null);
    }
  };

  return (
    <main className="app onboarding">
      <div className="onboarding__titlebar">
        <span className="type-label">PIN</span>
      </div>
      <section className="onboarding__content">
        <p className="onboarding__eyebrow">WELCOME</p>
        <h1>还没有任何部件。从这里开一个：</h1>
        <div className="onboarding__options">
          {WIDGET_OPTIONS.map((option) => (
            <button
              className="onboarding__option"
              disabled={creating !== null}
              key={option.type}
              onClick={() => void createWidget(option.type)}
              type="button"
            >
              <span className={`widget-swatch widget-swatch--${option.type}`} />
              {creating === option.type ? '创建中…' : option.label}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}

function ManagerTitleBar({ count, onHide, onSettings }: { count: number; onHide: () => void; onSettings: () => void }) {
  return (
    <header className="manager-titlebar">
      <span className="type-label">WIDGETS · {count}</span>
      <button
        aria-label="打开设置"
        className="title-action title-action--icon"
        onClick={onSettings}
        title="设置"
        type="button"
      >
        ⚙
      </button>
      <button
        aria-label="关闭管理面板"
        className="title-action title-action--icon"
        onClick={onHide}
        title="关闭管理面板"
        type="button"
      >
        ×
      </button>
    </header>
  );
}

function ManagerWidgetRow({
  widget,
  disabled,
  editing,
  renameDraft,
  onDeleteRequest,
  onHiddenChange,
  onPinChange,
  onRenameCancel,
  onRenameChange,
  onRenameCommit,
  onRenameStart,
}: {
  widget: PinWidget;
  disabled: boolean;
  editing: boolean;
  renameDraft: string;
  onDeleteRequest: (widget: PinWidget) => void;
  onHiddenChange: (widget: PinWidget) => void;
  onPinChange: (widget: PinWidget) => void;
  onRenameCancel: () => void;
  onRenameChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameStart: (widget: PinWidget) => void;
}) {
  return (
    <div className={widget.hidden ? 'manager-row manager-row--hidden' : 'manager-row'}>
      <span className={`manager-type manager-type--${widget.type}`}>{widget.type.toUpperCase()}</span>
      {editing ? (
        <input
          aria-label={`重命名 ${widgetDisplayName(widget)}`}
          autoFocus
          className="manager-name-input"
          onBlur={onRenameCommit}
          onChange={(event) => onRenameChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onRenameCommit();
            } else if (event.key === 'Escape') {
              event.preventDefault();
              onRenameCancel();
            }
          }}
          value={renameDraft}
        />
      ) : (
        <button
          className="manager-name manager-name-button"
          onDoubleClick={() => onRenameStart(widget)}
          title="双击重命名"
          type="button"
        >
          {widgetDisplayName(widget)}
        </button>
      )}
      <button
        aria-pressed={widget.pin}
        aria-label={widget.pin ? `取消置顶 ${widgetDisplayName(widget)}` : `置顶 ${widgetDisplayName(widget)}`}
        className={widget.pin ? 'manager-action manager-action--active' : 'manager-action'}
        disabled={disabled}
        onClick={() => onPinChange(widget)}
        title={widget.pin ? '取消置顶' : '置顶'}
        type="button"
      >
        PIN
      </button>
      <button
        aria-pressed={!widget.hidden}
        aria-label={widget.hidden ? `显示 ${widgetDisplayName(widget)}` : `隐藏 ${widgetDisplayName(widget)}`}
        className="manager-action manager-action--icon"
        disabled={disabled}
        onClick={() => onHiddenChange(widget)}
        title={widget.hidden ? '显示窗口' : '隐藏窗口'}
        type="button"
      >
        {widget.hidden ? '○' : '◉'}
      </button>
      <button
        aria-label={`删除 ${widgetDisplayName(widget)}`}
        className="manager-action manager-action--icon manager-delete-action"
        disabled={disabled}
        onClick={() => onDeleteRequest(widget)}
        title="删除窗口"
        type="button"
      >
        ×
      </button>
    </div>
  );
}

function Manager() {
  const [widgets, setWidgets] = useState<PinWidget[]>([]);
  const [theme, setTheme] = useState<PinSettings['theme']>('light');
  const [filter, setFilter] = useState<WidgetType | 'all'>('all');
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [pendingDelete, setPendingDelete] = useState<PinWidget | null>(null);
  const [undoWidget, setUndoWidget] = useState<PinWidget | null>(null);

  const reload = async () => {
    const nextWidgets = await window.pinApi.listManagedWidgets();
    if (nextWidgets) {
      setWidgets(nextWidgets);
      const renameId = getWindowContext().renameId;
      const renameWidget = renameId ? nextWidgets.find((widget) => widget.id === renameId) : undefined;
      if (renameWidget) {
        setEditingId(renameWidget.id);
        setRenameDraft(renameWidget.title);
      }
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    const unsubscribe = window.pinApi.onWidgetChanged((updated) => {
      setWidgets((current) => current.map((widget) => (widget.id === updated.id ? updated : widget)));
    });
    const unsubscribeDeleted = window.pinApi.onWidgetDeleted((widgetId) => {
      setWidgets((current) => current.filter((widget) => widget.id !== widgetId));
    });
    return () => {
      unsubscribe();
      unsubscribeDeleted();
    };
  }, []);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.pinApi.onSettingsChanged((settings) => {
      if (active) {
        setTheme(settings.effectiveTheme);
      }
    });
    void window.pinApi.getSettings().then((settings) => {
      if (active) {
        setTheme(settings.effectiveTheme);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!undoWidget) {
      return undefined;
    }
    const timer = window.setTimeout(() => setUndoWidget(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [undoWidget]);

  const updateWidget = (updated: PinWidget | null) => {
    if (!updated) {
      return;
    }
    setWidgets((current) => current.map((widget) => (widget.id === updated.id ? updated : widget)));
  };

  const toggleHidden = async (widget: PinWidget) => {
    setBusy(true);
    try {
      updateWidget(await window.pinApi.setManagedWidgetHidden(widget.id, !widget.hidden));
    } finally {
      setBusy(false);
    }
  };

  const togglePin = async (widget: PinWidget) => {
    setBusy(true);
    try {
      updateWidget(await window.pinApi.setManagedWidgetPin(widget.id, !widget.pin));
    } finally {
      setBusy(false);
    }
  };

  const startRename = (widget: PinWidget) => {
    setEditingId(widget.id);
    setRenameDraft(widget.title);
  };

  const cancelRename = () => {
    setEditingId(null);
    setRenameDraft('');
  };

  const commitRename = async () => {
    if (!editingId) {
      return;
    }
    const widget = widgets.find((item) => item.id === editingId);
    const title = renameDraft.trim();
    cancelRename();
    if (!widget || !title || title === widget.title) {
      return;
    }
    setBusy(true);
    try {
      updateWidget(await window.pinApi.renameManagedWidget(widget.id, title));
    } finally {
      setBusy(false);
    }
  };

  const requestDelete = (widget: PinWidget) => {
    setPendingDelete(widget);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) {
      return;
    }
    const widget = pendingDelete;
    setPendingDelete(null);
    cancelRename();
    setBusy(true);
    try {
      const deleted = await window.pinApi.deleteManagedWidget(widget.id);
      if (deleted) {
        setWidgets((current) => current.filter((item) => item.id !== deleted.id));
        setUndoWidget(deleted);
      }
    } finally {
      setBusy(false);
    }
  };

  const restoreDeletedWidget = async () => {
    setBusy(true);
    try {
      const restored = await window.pinApi.restoreManagedWidget();
      if (restored) {
        setUndoWidget(null);
        await reload();
      }
    } finally {
      setBusy(false);
    }
  };

  const setAllHidden = async (hidden: boolean) => {
    setBusy(true);
    try {
      const updated = await window.pinApi.setAllManagedWidgetsHidden(hidden);
      if (updated) {
        setWidgets(updated);
      }
    } finally {
      setBusy(false);
    }
  };

  const createWidget = async (type: WidgetType) => {
    setBusy(true);
    try {
      await window.pinApi.createManagedWidget(type);
      setNewMenuOpen(false);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const filteredWidgets = filter === 'all' ? widgets : widgets.filter((widget) => widget.type === filter);

  return (
    <main className={theme === 'dark' ? 'app manager-app management-dark' : 'app manager-app'}>
      <ManagerTitleBar
        count={widgets.length}
        onHide={() => void window.pinApi.hideManager()}
        onSettings={() => void window.pinApi.openSettings()}
      />
      <nav aria-label="窗口类型筛选" className="manager-filters">
        {MANAGER_FILTER_OPTIONS.map((option) => {
          const count = option.type === 'all' ? widgets.length : widgets.filter((widget) => widget.type === option.type).length;
          return (
            <button
              aria-pressed={filter === option.type}
              className={filter === option.type ? 'manager-filter manager-filter--active' : 'manager-filter'}
              key={option.type}
              onClick={() => setFilter(option.type)}
              type="button"
            >
              {option.label} {count}
            </button>
          );
        })}
      </nav>
      <section aria-label="窗口列表" className="manager-list">
        {filteredWidgets.length === 0 ? (
          <p className="manager-empty">没有匹配的窗口</p>
        ) : (
          filteredWidgets.map((widget) => (
            <ManagerWidgetRow
              disabled={busy}
              editing={editingId === widget.id}
              key={widget.id}
              onDeleteRequest={requestDelete}
              onHiddenChange={toggleHidden}
              onPinChange={togglePin}
              onRenameCancel={cancelRename}
              onRenameChange={setRenameDraft}
              onRenameCommit={() => void commitRename()}
              onRenameStart={startRename}
              renameDraft={renameDraft}
              widget={widget}
            />
          ))
        )}
        {undoWidget && (
          <div className="manager-undo-row">
            <span className="manager-undo-text">已删除“{widgetDisplayName(undoWidget)}”</span>
            <button
              className="manager-undo-button"
              disabled={busy}
              onClick={() => void restoreDeletedWidget()}
              type="button"
            >
              撤销
            </button>
          </div>
        )}
      </section>
      <footer className="manager-footer">
        <div className="manager-visibility-actions">
          <button disabled={busy} onClick={() => void setAllHidden(false)} type="button">◉ 全部显示</button>
          <button disabled={busy} onClick={() => void setAllHidden(true)} type="button">○ 全部隐藏</button>
        </div>
        <div className="manager-new-wrap">
          {newMenuOpen && (
            <div className="manager-new-menu">
              {WIDGET_OPTIONS.map((option) => (
                <button disabled={busy} key={option.type} onClick={() => void createWidget(option.type)} type="button">
                  <span className={`widget-swatch widget-swatch--${option.type}`} />
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <button
            aria-expanded={newMenuOpen}
            className="manager-new-button"
            disabled={busy}
            onClick={() => setNewMenuOpen((open) => !open)}
            type="button"
          >
            + NEW {newMenuOpen ? '▴' : '▾'}
          </button>
        </div>
      </footer>
      {pendingDelete && (
        <div className="manager-confirm-backdrop" role="presentation">
          <section aria-modal="true" className="manager-confirm" role="dialog">
            <h2>删除窗口？</h2>
            <p>“{widgetDisplayName(pendingDelete)}”及其内容会被删除。</p>
            <div className="manager-confirm-actions">
              <button disabled={busy} onClick={() => setPendingDelete(null)} type="button">取消</button>
              <button className="manager-confirm-delete" disabled={busy} onClick={() => void confirmDelete()} type="button">删除</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

const DEFAULT_SETTINGS: PinSettings = {
  theme: 'light',
  autoTheme: false,
  effectiveTheme: 'light',
  defaultPaperColor: '#FFFFFF',
  defaultInkColor: '#111111',
  defaultTitleColor: '#FFE566',
  defaultAccentColor: '#FFE566',
  defaultSpineColor: null,
  defaultShadowColor: '#111111',
  maxLines: 0,
  hoverFull: true,
  scrollbar: 'overlay',
  opacityBar: true,
  defaultOpacity: 100,
  pinAll: false,
  autostart: false,
  snap: true,
};

function SettingsTitleBar({ onHide }: { onHide: () => void }) {
  return (
    <header className="settings-titlebar">
      <span className="type-label">SETTINGS</span>
      <button
        aria-label="关闭设置"
        className="title-action title-action--icon"
        onClick={onHide}
        title="关闭设置"
        type="button"
      >
        ×
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

function ColorSwatches({ colors }: { colors: { paper: string; accent: string; ink: string } }) {
  return (
    <span aria-hidden="true" className="color-swatches">
      <span style={{ background: colors.paper }} />
      <span style={{ background: colors.accent }} />
      <span style={{ background: colors.ink }} />
    </span>
  );
}

type EditableColorPart = 'title' | 'accent' | 'spine' | 'paper' | 'shadow';

const PRIMARY_COLORS = ['#FFE566', '#E5B64B', '#5E82AA', '#6E9C7B'] as const;
const COLOR_PARTS: Array<{ id: EditableColorPart; label: string; nullable: boolean; options: Array<string | null> }> = [
  { id: 'title', label: '标题栏底', nullable: true, options: [...PRIMARY_COLORS, null] },
  { id: 'accent', label: '选中 · 拖拽行', nullable: false, options: [...PRIMARY_COLORS] },
  { id: 'spine', label: '左色脊', nullable: true, options: [...PRIMARY_COLORS, null] },
  { id: 'paper', label: '窗口底纸色', nullable: false, options: ['#FFFFFF', '#FFF9D6', '#EDF6EF', '#E8F1FB', '#0D0D0D'] },
  { id: 'shadow', label: '硬阴影', nullable: false, options: ['#111111', '#F2F2F2', ...PRIMARY_COLORS] },
];

function SettingsPanel() {
  const [settings, setSettings] = useState<PinSettings>(DEFAULT_SETTINGS);
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

  const updateDefaultOpacity = (defaultOpacity: number) => {
    setSettings((current) => ({ ...current, defaultOpacity }));
    void window.pinApi.updateSettings({ defaultOpacity }).then((updated) => {
      if (updated) {
        setSettings(updated);
      }
    });
  };

  return (
    <main className={effectiveTheme(settings) === 'dark' ? 'app settings-app management-dark' : 'app settings-app'}>
      <SettingsTitleBar onHide={() => void window.pinApi.hideSettings()} />
      <div className="settings-scroll">
        <SettingsSection title="WINDOW">
          <SettingsToggle checked={settings.pinAll} disabled={busy} label="全部始终置顶" onChange={(pinAll) => void updateSettings({ pinAll })} />
          <SettingsToggle checked={settings.autostart} disabled={busy} label="开机自启" onChange={(autostart) => void updateSettings({ autostart })} />
          <SettingsToggle checked={settings.snap} disabled={busy} label="吸附屏幕边缘" onChange={(snap) => void updateSettings({ snap })} />
          <SettingsToggle checked={settings.hoverFull} disabled={busy} label="溢出悬停显示全文" onChange={(hoverFull) => void updateSettings({ hoverFull })} />
        </SettingsSection>
        <SettingsSection title="THEME">
          <SettingsSegmented
            disabled={busy}
            onChange={(theme) => void updateSettings(theme === 'auto' ? { autoTheme: true } : { theme, autoTheme: false })}
            options={[{ id: 'light', label: 'LIGHT' }, { id: 'dark', label: 'DARK' }, { id: 'auto', label: 'AUTO' }]}
            value={settings.autoTheme ? 'auto' : settings.theme}
          />
        </SettingsSection>
        <SettingsSection title="DEFAULTS">
          <button className="settings-kit-row" onClick={() => void window.pinApi.openDefaultColors()} type="button">
            <span>配色套装</span>
            <span className="settings-kit-value">
              <ColorSwatches colors={{ paper: settings.defaultPaperColor, accent: settings.defaultAccentColor, ink: settings.defaultInkColor }} />
              {currentPreset?.name ?? '自定义'} <span aria-hidden="true">›</span>
            </span>
          </button>
          <div className="settings-row settings-range-row">
            <label htmlFor="default-opacity">新窗口透明度</label>
            <input
              aria-label="新窗口透明度"
              disabled={busy}
              id="default-opacity"
              max="100"
              min="35"
              onChange={(event) => updateDefaultOpacity(Number(event.target.value))}
              type="range"
              value={settings.defaultOpacity}
            />
            <output>{settings.defaultOpacity}%</output>
          </div>
          <SettingsToggle checked={settings.opacityBar} disabled={busy} label="窗口内显示透明度条" onChange={(opacityBar) => void updateSettings({ opacityBar })} />
          <p className="settings-hint">关掉透明度条后，它会出现在窗口右键菜单里</p>
        </SettingsSection>
        <SettingsSection title="TEXT">
          <div className="settings-row settings-choice-row">
            <span>条目最多显示</span>
            <SettingsSegmented
              disabled={busy}
              onChange={(maxLines) => void updateSettings({ maxLines: Number(maxLines) })}
              options={[{ id: '1', label: '1 行' }, { id: '2', label: '2 行' }, { id: '3', label: '3 行' }, { id: '0', label: '不限' }]}
              value={String(settings.maxLines) as '0' | '1' | '2' | '3'}
            />
          </div>
          <div className="settings-row settings-choice-row">
            <span>滚动条</span>
            <SettingsSegmented
              disabled={busy}
              onChange={(scrollbar) => void updateSettings({ scrollbar })}
              options={[{ id: 'always', label: '常驻' }, { id: 'overlay', label: '悬浮' }, { id: 'hidden', label: '隐藏' }]}
              value={settings.scrollbar}
            />
          </div>
        </SettingsSection>
      </div>
      <footer className="settings-footer">
        <span>v0.3</span>
        <button disabled={busy} onClick={() => void resetSettings()} type="button">RESET</button>
      </footer>
    </main>
  );
}

function ColorsTitleBar({
  onBack,
  onHide,
  onSave,
  title,
}: {
  onBack?: () => void;
  onHide: () => void;
  onSave?: () => void;
  title: string;
}) {
  return (
    <header className="colors-titlebar">
      {onBack && (
        <button
          aria-label="返回套装列表"
          className="title-action title-action--icon"
          onClick={onBack}
          title="返回套装列表"
          type="button"
        >
          ‹
        </button>
      )}
      <span className="type-label">COLORS · {title}</span>
      {onSave && (
        <button className="colors-save-action" onClick={onSave} type="button">
          存为套装
        </button>
      )}
      <button
        aria-label="关闭颜色面板"
        className="title-action title-action--icon"
        onClick={onHide}
        title="关闭颜色面板"
        type="button"
      >
        ×
      </button>
    </header>
  );
}

function ColorsPanel() {
  const [context, setContext] = useState<PinColorContext | null>(null);
  const [kits, setKits] = useState<PinCustomKit[]>([]);
  const [theme, setTheme] = useState<PinSettings['theme']>('light');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'kits' | 'custom'>('kits');
  const [expandedPart, setExpandedPart] = useState<EditableColorPart | null>(null);
  const [editorBaseColors, setEditorBaseColors] = useState<PinColorSet | null>(null);

  const reload = async () => {
    const nextContext = await window.pinApi.getColorContext();
    setContext(nextContext);
  };

  useEffect(() => {
    let active = true;
    const unsubscribe = window.pinApi.onSettingsChanged((settings) => {
      if (active) {
        setTheme(settings.effectiveTheme);
        void reload();
      }
    });
    const unsubscribeDeleted = window.pinApi.onWidgetDeleted((widgetId) => {
      const windowContext = getWindowContext();
      if (windowContext.scope === 'widget' && windowContext.widgetId === widgetId) {
        setContext(null);
      }
    });
    void Promise.all([
      window.pinApi.getSettings(),
      window.pinApi.getColorContext(),
      window.pinApi.listColorKits(),
    ]).then(
      ([settings, nextContext, nextKits]) => {
        if (!active) {
          return;
        }
        setTheme(settings.effectiveTheme);
        setContext(nextContext);
        setKits(nextKits ?? []);
      },
    );
    return () => {
      active = false;
      unsubscribe();
      unsubscribeDeleted();
    };
  }, []);

  const applyPreset = async (presetId: string) => {
    setBusy(true);
    try {
      await window.pinApi.applyColorPreset(presetId);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const applyKit = async (kitId: string) => {
    setBusy(true);
    try {
      await window.pinApi.applyColorKit(kitId);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const saveKit = async () => {
    if (!context?.colors) {
      return;
    }
    const name = window.prompt('套装名称', '我的套装')?.trim();
    if (!name) {
      return;
    }
    setBusy(true);
    try {
      const created = await window.pinApi.createColorKit(name);
      if (created) {
        setKits((current) => [...current, created]);
      }
    } finally {
      setBusy(false);
    }
  };

  const renameKit = async (kit: PinCustomKit) => {
    const name = window.prompt('重命名套装', kit.name)?.trim();
    if (!name || name === kit.name) {
      return;
    }
    setBusy(true);
    try {
      const updated = await window.pinApi.renameColorKit(kit.id, name);
      if (updated) {
        setKits((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      }
    } finally {
      setBusy(false);
    }
  };

  const deleteKit = async (kit: PinCustomKit) => {
    if (!window.confirm(`删除配色套装“${kit.name}”？`)) {
      return;
    }
    setBusy(true);
    try {
      const deleted = await window.pinApi.deleteColorKit(kit.id);
      if (deleted) {
        setKits((current) => current.filter((item) => item.id !== deleted.id));
      }
    } finally {
      setBusy(false);
    }
  };

  const restoreDefault = async () => {
    setBusy(true);
    try {
      const updated = await window.pinApi.setWidgetFollowDefault(true);
      if (updated) {
        await reload();
      }
    } finally {
      setBusy(false);
    }
  };

  const openCustomEditor = () => {
    if (!context?.colors) {
      return;
    }
    setEditorBaseColors({ ...context.colors });
    setExpandedPart(null);
    setView('custom');
  };

  const updatePart = async (part: EditableColorPart, value: string | null) => {
    setBusy(true);
    try {
      await window.pinApi.updateColorParts({ [part]: value });
      await reload();
      setExpandedPart(null);
    } finally {
      setBusy(false);
    }
  };

  const applyPrimary = async (color: string) => {
    setBusy(true);
    try {
      await window.pinApi.applyPrimaryColor(color);
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const restoreEditorBase = async () => {
    if (!editorBaseColors) {
      return;
    }
    setBusy(true);
    try {
      await window.pinApi.updateColorParts(editorBaseColors);
      await reload();
      setExpandedPart(null);
    } finally {
      setBusy(false);
    }
  };

  const currentColors = context?.colors;
  const isWidgetScope = context?.scope === 'widget';
  const windowContext = getWindowContext();
  const title = isWidgetScope ? context?.widgetTitle ?? '窗口' : windowContext.scope === 'widget' ? '窗口' : '默认';
  const currentKitId = kits.find((kit) => currentColors && colorSetEquals(kit, currentColors))?.id;
  const activePrimary = PRIMARY_COLORS.find((color) => (
    currentColors?.title === color &&
    currentColors.accent === color &&
    currentColors.spine === color &&
    currentColors.shadow === color &&
    currentColors.paper === mixColor(color, '#FFFFFF', 0.88)
  ));
  return (
    <main className={theme === 'dark' ? 'app colors-app management-dark' : 'app colors-app'}>
      <ColorsTitleBar
        onBack={view === 'custom' ? () => setView('kits') : undefined}
        onHide={() => void window.pinApi.hideColors()}
        onSave={view === 'custom' ? () => void saveKit() : undefined}
        title={title}
      />
      {view === 'kits' ? (
        <section className="colors-section">
          <h2>套装</h2>
          {COLOR_PRESETS.map((preset) => (
            <button
              className={context?.activePresetId === preset.id ? 'color-preset color-preset--active' : 'color-preset'}
              disabled={busy}
              key={preset.id}
              onClick={() => void applyPreset(preset.id)}
              type="button"
            >
              <ColorSwatches colors={preset} />
              <span>{preset.name}</span>
              {context?.activePresetId === preset.id && <span className="color-preset-current">当前</span>}
            </button>
          ))}
          {kits.map((kit) => (
            <div className={currentKitId === kit.id ? 'color-kit-row color-kit-row--active' : 'color-kit-row'} key={kit.id}>
              <button
                className="color-preset color-kit-apply"
                disabled={busy}
                onClick={() => void applyKit(kit.id)}
                type="button"
              >
                <ColorSwatches colors={kit} />
                <span>{kit.name}</span>
                {currentKitId === kit.id && <span className="color-preset-current">当前</span>}
              </button>
              <button
                aria-label={`重命名 ${kit.name}`}
                className="color-kit-action"
                disabled={busy}
                onClick={() => void renameKit(kit)}
                title="重命名套装"
                type="button"
              >
                ✎
              </button>
              <button
                aria-label={`删除 ${kit.name}`}
                className="color-kit-action color-kit-action--delete"
                disabled={busy}
                onClick={() => void deleteKit(kit)}
                title="删除套装"
                type="button"
              >
                ×
              </button>
            </div>
          ))}
          <button className="color-custom-placeholder" disabled={busy} onClick={openCustomEditor} type="button">
            ＋ 自定义… ›
          </button>
        </section>
      ) : (
        <section className="colors-section colors-custom-section">
          <h2>主色 · 一选五处同步</h2>
          <div className="color-primary-grid">
            {PRIMARY_COLORS.map((color) => (
              <button
                aria-label={`主色 ${color}`}
                className={activePrimary === color ? 'color-primary color-primary--active' : 'color-primary'}
                disabled={busy}
                key={color}
                onClick={() => void applyPrimary(color)}
                style={{ background: color }}
                title={color}
                type="button"
              />
            ))}
          </div>
          <h2>五处 · 可各自改</h2>
          <div className="color-parts-list">
            {COLOR_PARTS.map((part) => {
              const value = currentColors?.[part.id] ?? null;
              const expanded = expandedPart === part.id;
              return (
                <div className="color-part" key={part.id}>
                  <button
                    aria-expanded={expanded}
                    className="color-part-trigger"
                    disabled={busy}
                    onClick={() => setExpandedPart(expanded ? null : part.id)}
                    type="button"
                  >
                    <span>{part.label}</span>
                    <span className="color-part-value">
                      <span className={value ? 'color-part-swatch' : 'color-part-swatch color-part-swatch--none'} style={value ? { background: value } : undefined} />
                      <span>{value ?? '/'}</span>
                      <span aria-hidden="true">▾</span>
                    </span>
                  </button>
                  {expanded && (
                    <div className="color-part-options">
                      {part.options.map((option) => (
                        <button
                          aria-label={option ?? '无'}
                          className={value === option ? 'color-part-option color-part-option--active' : 'color-part-option'}
                          disabled={busy}
                          key={option ?? 'none'}
                          onClick={() => void updatePart(part.id, option)}
                          style={option ? { background: option } : undefined}
                          title={option ?? '无'}
                          type="button"
                        >
                          {!option && '/'}
                          {value === option && <span aria-hidden="true">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      <footer className="colors-footer">
        <span>
          {view === 'custom'
            ? isWidgetScope
              ? '改动即时作用于本窗口'
              : '同步跟随默认的窗口'
            : currentColors
              ? isWidgetScope && context?.followsDefault === false
                ? '改动即时作用于本窗口'
                : '同步跟随默认的窗口'
              : '加载中…'}
        </span>
        {view === 'kits' && isWidgetScope && (
          <button
            disabled={busy || context?.followsDefault === true}
            onClick={() => void restoreDefault()}
            type="button"
          >
            恢复默认
          </button>
        )}
        {view === 'custom' && (
          <button disabled={busy || !editorBaseColors} onClick={() => void restoreEditorBase()} type="button">
            恢复默认
          </button>
        )}
      </footer>
    </main>
  );
}

function TitleBar({ widget, onHide, onPin, onCollapse }: {
  widget: PinWidget;
  onHide: () => void;
  onPin: () => void;
  onCollapse: () => void;
}) {
  const dragRef = useRef<{
    pointerId: number;
    startScreenX: number;
    startScreenY: number;
    currentScreenX: number;
    currentScreenY: number;
    originX: number;
    originY: number;
    ready: boolean;
    frame: number | null;
  } | null>(null);

  const flushDrag = () => {
    const drag = dragRef.current;
    if (!drag || !drag.ready) {
      return;
    }
    drag.frame = null;
    void window.pinApi.setPosition(
      drag.originX + drag.currentScreenX - drag.startScreenX,
      drag.originY + drag.currentScreenY - drag.startScreenY,
    );
  };

  const scheduleDrag = () => {
    const drag = dragRef.current;
    if (!drag || !drag.ready || drag.frame !== null) {
      return;
    }
    drag.frame = requestAnimationFrame(flushDrag);
  };

  const finishDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (drag.frame !== null) {
      cancelAnimationFrame(drag.frame);
      drag.frame = null;
    }
    if (drag.ready) {
      void window.pinApi.setPosition(
        drag.originX + drag.currentScreenX - drag.startScreenX,
        drag.originY + drag.currentScreenY - drag.startScreenY,
      );
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  return (
    <header
      className="titlebar"
      onDoubleClick={onCollapse}
      onPointerCancel={finishDrag}
      onPointerDown={(event) => {
        if (
          event.button !== 0 ||
          (event.target instanceof Element && event.target.closest('button'))
        ) {
          return;
        }
        event.preventDefault();
        event.currentTarget.setPointerCapture(event.pointerId);
        const drag = {
          pointerId: event.pointerId,
          startScreenX: event.screenX,
          startScreenY: event.screenY,
          currentScreenX: event.screenX,
          currentScreenY: event.screenY,
          originX: 0,
          originY: 0,
          ready: false,
          frame: null as number | null,
        };
        dragRef.current = drag;
        void window.pinApi.getWindowBounds().then((bounds) => {
          if (dragRef.current !== drag) {
            return;
          }
          if (!bounds) {
            dragRef.current = null;
            return;
          }
          drag.originX = bounds.x;
          drag.originY = bounds.y;
          drag.ready = true;
          scheduleDrag();
        });
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) {
          return;
        }
        event.preventDefault();
        drag.currentScreenX = event.screenX;
        drag.currentScreenY = event.screenY;
        scheduleDrag();
      }}
      onPointerUp={finishDrag}
    >
      <span className="type-label">{widget.type.toUpperCase()}</span>
      <button
        aria-pressed={widget.pin}
        className={widget.pin ? 'title-action title-action--active' : 'title-action'}
        onClick={onPin}
        onDoubleClick={(event) => event.stopPropagation()}
        title={widget.pin ? '取消置顶' : '置顶'}
        type="button"
      >
        PIN
      </button>
      <button
        aria-label={widget.collapsed ? '展开' : '折叠'}
        className="title-action title-action--icon"
        onClick={onCollapse}
        onDoubleClick={(event) => event.stopPropagation()}
        title={widget.collapsed ? '展开' : '折叠'}
        type="button"
      >
        {widget.collapsed ? '▣' : '–'}
      </button>
      <button
        aria-label="隐藏窗口"
        className="title-action title-action--icon"
        onClick={onHide}
        onDoubleClick={(event) => event.stopPropagation()}
        title="隐藏窗口"
        type="button"
      >
        ×
      </button>
    </header>
  );
}

function OpacityBar({ widget, onChange }: { widget: PinWidget; onChange: (value: number) => void }) {
  return (
    <footer className="opacity-bar">
      <label htmlFor="opacity">OPACITY</label>
      <input
        aria-label="窗口透明度"
        id="opacity"
        max="100"
        min="35"
        onChange={(event) => onChange(Number(event.target.value))}
        type="range"
        value={widget.opacity}
      />
      <output>{widget.opacity}%</output>
    </footer>
  );
}

interface ContextMenuState {
  position: { left: number; top: number } | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  handleContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
  close: () => void;
}

function useContextMenu(enabled: boolean): ContextMenuState {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) {
      return undefined;
    }
    const close = (event: MouseEvent) => {
      if (event.button !== 0 || (event.target instanceof Node && menuRef.current?.contains(event.target))) {
        return;
      }
      setPosition(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [position]);

  const handleContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    if (!enabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setPosition({
      left: Math.min(event.clientX, Math.max(8, window.innerWidth - 204)),
      top: Math.min(event.clientY, Math.max(8, window.innerHeight - 292)),
    });
  };

  return { position, menuRef, handleContextMenu, close: () => setPosition(null) };
}

function OpacityContextMenu({
  menu,
  onPin,
  onChange,
  widget,
  showOpacity,
}: {
  menu: ContextMenuState;
  onPin: () => void;
  onChange: (value: number) => void;
  widget: PinWidget;
  showOpacity: boolean;
}) {
  if (!menu.position) {
    return null;
  }
  return (
    <div
      className="window-context-menu"
      onContextMenu={(event) => event.stopPropagation()}
      ref={menu.menuRef}
      style={menu.position}
    >
      {showOpacity && (
        <div className="window-context-menu-opacity">
          <label htmlFor="context-opacity">透明度</label>
          <input
            aria-label="窗口透明度"
            id="context-opacity"
            max="100"
            min="35"
            onChange={(event) => onChange(Number(event.target.value))}
            type="range"
            value={widget.opacity}
          />
          <output>{widget.opacity}%</output>
        </div>
      )}
      <button
        className="window-context-menu-item"
        onClick={() => {
          menu.close();
          void window.pinApi.createSameWidget();
        }}
        type="button"
      >
        再开一个同类
      </button>
      <button
        className="window-context-menu-item"
        onClick={() => {
          menu.close();
          onPin();
        }}
        type="button"
      >
        {widget.pin ? '取消置顶' : '置顶显示'}
      </button>
      <button
        className="window-context-menu-item"
        onClick={() => {
          menu.close();
          void window.pinApi.openWidgetColors();
        }}
        type="button"
      >
        颜色…
      </button>
      <button
        className="window-context-menu-item"
        onClick={() => {
          menu.close();
          void window.pinApi.openManagerRename();
        }}
        type="button"
      >
        重命名…
      </button>
      <button
        className="window-context-menu-item"
        onClick={() => {
          menu.close();
          void window.pinApi.hideWindow();
        }}
        type="button"
      >
        隐藏（保留内容）
      </button>
      <button
        className="window-context-menu-item window-context-menu-item--delete"
        onClick={() => {
          if (!window.confirm(`删除窗口“${widget.title.trim() || widget.type.toUpperCase()}”？`)) {
            return;
          }
          menu.close();
          void window.pinApi.deleteCurrentWidget();
        }}
        type="button"
      >
        删除
      </button>
    </div>
  );
}

function ResizeHandle() {
  const resizeState = useRef<{
    pointerId: number;
    startScreenX: number;
    startScreenY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeState.current = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      startWidth: window.outerWidth,
      startHeight: window.outerHeight,
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = resizeState.current;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }
    void window.pinApi.setSize(
      state.startWidth + event.screenX - state.startScreenX,
      state.startHeight + event.screenY - state.startScreenY,
    );
  };

  const stopResizing = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = resizeState.current;
    if (!state || state.pointerId !== event.pointerId) {
      return;
    }
    resizeState.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      aria-label="调整窗口大小"
      className="resize-handle"
      onPointerCancel={stopResizing}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopResizing}
      role="separator"
    />
  );
}

function HoverText({
  text,
  className,
  maxLines,
  hoverFull,
  onDoubleClick,
  completing,
}: {
  text: string;
  className: string;
  maxLines: number;
  hoverFull: boolean;
  onDoubleClick: () => void;
  completing: boolean;
}) {
  const textRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const [tooltip, setTooltip] = useState<{
    left: number;
    top: number;
    width: number;
    sourceTop: number;
    sourceBottom: number;
  } | null>(null);

  const hideTooltip = () => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    setTooltip(null);
  };

  const showTooltip = () => {
    if (!hoverFull || !textRef.current) {
      return;
    }
    const element = textRef.current;
    if (element.scrollHeight - element.clientHeight < 2 && element.scrollWidth - element.clientWidth < 2) {
      return;
    }
    timerRef.current = window.setTimeout(() => {
      const rect = element.getBoundingClientRect();
      setTooltip({
        left: rect.left,
        top: rect.bottom + 6,
        width: Math.max(220, rect.width),
        sourceTop: rect.top,
        sourceBottom: rect.bottom,
      });
      timerRef.current = undefined;
    }, 400);
  };

  useEffect(() => () => hideTooltip(), []);

  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) {
      return;
    }
    const tipRect = tooltipRef.current.getBoundingClientRect();
    const padding = 8;
    const left = Math.min(
      Math.max(padding, tooltip.left),
      Math.max(padding, window.innerWidth - tipRect.width - padding),
    );
    let top = tooltip.sourceBottom + 6;
    if (top + tipRect.height + padding > window.innerHeight) {
      top = tooltip.sourceTop - tipRect.height - 6;
    }
    top = Math.min(
      Math.max(padding, top),
      Math.max(padding, window.innerHeight - tipRect.height - padding),
    );
    if (left !== tooltip.left || top !== tooltip.top) {
      setTooltip((current) => (current ? { ...current, left, top } : current));
    }
  }, [tooltip]);

  const textClass = maxLines > 0 ? `${className} todo-text--clamp` : `${className} todo-text--unlimited`;

  return (
    <>
      <button
        className={textClass}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onDoubleClick();
        }}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        ref={textRef}
        style={maxLines > 0 ? { WebkitLineClamp: maxLines } : undefined}
        type="button"
      >
        {text}
        {completing && <span aria-hidden="true" className="todo-text-strike" />}
      </button>
      {tooltip && createPortal(
        <div
          className="overflow-tooltip"
          ref={tooltipRef}
          style={{ left: tooltip.left, top: tooltip.top, width: tooltip.width }}
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}

function ClipRow({
  item,
  index,
  copied,
  onCopy,
  onDelete,
  onUpdate,
  dragging,
  dragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  hoverFull,
}: {
  item: PinClipItem;
  index: number;
  copied: boolean;
  onCopy: () => void;
  onDelete: () => void;
  onUpdate: (text: string) => void;
  dragging: boolean;
  dragOver: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  hoverFull: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.text);
  const composing = useRef(false);
  const suppressBlur = useRef(false);

  useEffect(() => {
    if (!editing) {
      setDraft(item.text);
    }
  }, [editing, item.text]);

  const beginEditing = () => {
    suppressBlur.current = false;
    setDraft(item.text);
    setEditing(true);
  };

  const cancelEditing = () => {
    suppressBlur.current = true;
    setDraft(item.text);
    setEditing(false);
  };

  const saveEditing = () => {
    if (suppressBlur.current) {
      suppressBlur.current = false;
      return;
    }
    setEditing(false);
    if (draft !== item.text && draft.trim() !== '') {
      onUpdate(draft);
    }
  };

  const handleEditKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isComposing = composing.current || event.nativeEvent.isComposing;
    if (event.key === 'Escape' && !isComposing) {
      event.preventDefault();
      cancelEditing();
    } else if (event.key === 'Enter' && !event.shiftKey && !isComposing) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <div
      className={`${copied ? 'clip-row clip-row--copied' : 'clip-row'}${dragging ? ' clip-row--dragging' : ''}${dragOver ? ' clip-row--drag-over' : ''}`}
      onClick={onCopy}
      onDragEnd={onDragEnd}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
    >
      <span className="clip-index">{String(index + 1).padStart(2, '0')}</span>
      {editing ? (
        <textarea
          aria-label="编辑剪贴文本"
          autoFocus
          className="clip-text clip-text--editing"
          onBlur={saveEditing}
          onChange={(event) => setDraft(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onKeyDown={handleEditKeyDown}
          rows={1}
          value={draft}
        />
      ) : (
        <HoverText
          className="clip-text"
          completing={false}
          hoverFull={hoverFull}
          maxLines={1}
          onDoubleClick={beginEditing}
          text={item.text}
        />
      )}
      <span aria-hidden="true" className="clip-copy-mark">⧉</span>
      <span
        aria-hidden="true"
        className="clip-drag-handle"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          onDragStart();
        }}
      >
        ⠿
      </span>
      <button
        aria-label="删除剪贴文本"
        className="clip-delete"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        title="删除剪贴文本"
        type="button"
      >
        ×
      </button>
    </div>
  );
}

function ClipWidget({ initialWidget, embedded = false }: { initialWidget: PinWidget; embedded?: boolean }) {
  const [widget, setWidget] = useState(initialWidget);
  useWidgetUpdates(setWidget);
  const [items, setItems] = useState<PinClipItem[]>([]);
  const contextMenu = useContextMenu(!embedded);
  const [draft, setDraft] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletedClip, setDeletedClip] = useState<PinClipItem | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const viewSettings = useWindowDisplaySettings();
  const [loaded, setLoaded] = useState(false);
  const [listHovered, setListHovered] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.outerWidth);
  const composing = useRef(false);

  useEffect(() => {
    if (!copiedId) {
      return;
    }
    const timer = window.setTimeout(() => setCopiedId(null), 1_200);
    return () => window.clearTimeout(timer);
  }, [copiedId]);

  useEffect(() => {
    if (!deletedClip) {
      return;
    }
    const timer = window.setTimeout(() => setDeletedClip(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [deletedClip]);

  useEffect(() => {
    let active = true;
    void window.pinApi.listClips().then(
      (nextItems) => {
        if (!active) {
          return;
        }
        setItems(nextItems ?? []);
        setLoaded(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleWindowResize = () => setWindowWidth(window.outerWidth);
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  const hide = () => {
    void window.pinApi.hideWindow();
  };

  const togglePin = () => {
    void window.pinApi.setPin(!widget.pin).then((updated) => {
      if (updated) {
        setWidget(updated);
      }
    });
  };

  const toggleCollapsed = () => {
    void window.pinApi.setCollapsed(!widget.collapsed).then((updated) => {
      if (updated) {
        setWidget(updated);
      }
    });
  };

  const setOpacity = (opacity: number) => {
    void window.pinApi.setOpacity(opacity).then((updated) => {
      if (updated) {
        setWidget(updated);
      }
    });
  };

  const addClip = () => {
    if (draft.trim() === '') {
      return;
    }
    const text = draft;
    setDraft('');
    void window.pinApi.createClip(text).then((created) => {
      if (created) {
        setItems((current) => [...current, created]);
      }
    });
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isComposing = composing.current || event.nativeEvent.isComposing;
    if (event.key === 'Enter' && !event.shiftKey && !isComposing) {
      event.preventDefault();
      addClip();
    }
  };

  const copyClip = (clipId: string) => {
    void window.pinApi.copyClip(clipId).then((copied) => {
      if (copied) {
        setCopiedId(copied.id);
      }
    });
  };

  const updateClip = (clipId: string, text: string) => {
    void window.pinApi.updateClip(clipId, text).then((updated) => {
      if (updated) {
        setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      }
    });
  };

  const deleteClip = (clipId: string) => {
    void window.pinApi.deleteClip(clipId).then((deleted) => {
      if (deleted) {
        setItems((current) => current.filter((item) => item.id !== clipId));
        setDeletedClip(deleted);
      }
    });
  };

  const restoreClip = () => {
    void window.pinApi.restoreClip().then((restored) => {
      if (restored) {
        setItems((current) => [...current, restored].sort(compareClips));
      }
      setDeletedClip(null);
    });
  };

  const reorderClips = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const orderedIds = items.map((item) => item.id);
    const sourceIndex = orderedIds.indexOf(dragId);
    const targetIndex = orderedIds.indexOf(targetId);
    if (sourceIndex < 0 || targetIndex < 0) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    orderedIds.splice(sourceIndex, 1);
    orderedIds.splice(orderedIds.indexOf(targetId), 0, dragId);
    setDragId(null);
    setDragOverId(null);
    void window.pinApi.reorderClips(orderedIds).then((updated) => {
      if (updated) {
        setItems(updated);
      }
    });
  };

  const clearDrag = () => {
    setDragId(null);
    setDragOverId(null);
  };

  const scrollbarMode = windowWidth < 300 ? 'overlay' : viewSettings.scrollbar;
  const listClassName = `clip-list clip-list--${scrollbarMode}${listHovered ? ' clip-list--hovered' : ''}`;

  return (
    <main
      className={embedded ? 'desk-panel widget-themed' : 'app widget-themed'}
      onContextMenu={!embedded ? contextMenu.handleContextMenu : undefined}
      style={widgetColorStyle(widget)}
    >
      {!embedded && <TitleBar onCollapse={toggleCollapsed} onHide={hide} onPin={togglePin} widget={widget} />}
      {!widget.collapsed && (
        <>
          <div
            className={listClassName}
            onMouseEnter={() => setListHovered(true)}
            onMouseLeave={() => setListHovered(false)}
          >
            {!loaded && <p className="app--loading">加载中…</p>}
            {loaded && items.map((item, index) => (
              <ClipRow
                copied={copiedId === item.id}
                dragOver={dragOverId === item.id}
                dragging={dragId === item.id}
                hoverFull={viewSettings.hoverFull}
                index={index}
                item={item}
                key={item.id}
                onCopy={() => copyClip(item.id)}
                onDelete={() => deleteClip(item.id)}
                onDragEnd={clearDrag}
                onDragOver={() => setDragOverId(item.id)}
                onDragStart={() => setDragId(item.id)}
                onDrop={() => reorderClips(item.id)}
                onUpdate={(text) => updateClip(item.id, text)}
              />
            ))}
            {deletedClip && (
              <div className="clip-undo-row">
                <span className="clip-undo-text">已删除「{deletedClip.text}」</span>
                <button className="clip-undo-button" onClick={restoreClip} type="button">
                  撤销
                </button>
              </div>
            )}
          </div>
          <footer className="clip-input-row">
            <span aria-hidden="true" className="clip-input-symbol">[+]</span>
            <textarea
              aria-label="新增剪贴文本"
              className="clip-input"
              onChange={(event) => setDraft(event.target.value)}
              onCompositionEnd={() => {
                composing.current = false;
              }}
              onCompositionStart={() => {
                composing.current = true;
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="写点什么…"
              rows={1}
              value={draft}
            />
          </footer>
          {!embedded && viewSettings.opacityBar && <OpacityBar onChange={setOpacity} widget={widget} />}
          {!embedded && <ResizeHandle />}
        </>
      )}
      {!embedded && <OpacityContextMenu menu={contextMenu} onChange={setOpacity} onPin={togglePin} showOpacity={!viewSettings.opacityBar} widget={widget} />}
    </main>
  );
}

function TodoRow({
  todo,
  onToggle,
  onDelete,
  onUpdate,
  maxLines,
  hoverFull,
  completing,
}: {
  todo: PinTodo;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (text: string) => void;
  maxLines: number;
  hoverFull: boolean;
  completing: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.text);
  const composing = useRef(false);
  const suppressBlur = useRef(false);
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: todo.id, disabled: editing || completing });

  useEffect(() => {
    if (!editing) {
      setDraft(todo.text);
    }
  }, [editing, todo.text]);

  const beginEditing = () => {
    suppressBlur.current = false;
    setDraft(todo.text);
    setEditing(true);
  };

  const cancelEditing = () => {
    suppressBlur.current = true;
    setDraft(todo.text);
    setEditing(false);
  };

  const saveEditing = () => {
    if (suppressBlur.current) {
      suppressBlur.current = false;
      return;
    }
    setEditing(false);
    if (draft !== todo.text && draft.trim() !== '') {
      onUpdate(draft);
    }
  };

  const handleEditKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isComposing = composing.current || event.nativeEvent.isComposing;
    if (event.key === 'Escape' && !isComposing) {
      event.preventDefault();
      cancelEditing();
    } else if (event.key === 'Enter' && !event.shiftKey && !isComposing) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  };

  return (
    <div
      className={`${todo.done ? 'todo-row todo-row--done' : 'todo-row'}${completing ? ' todo-row--completing' : ''}${isDragging ? ' todo-row--dragging' : ''}`}
      ref={setNodeRef}
      style={{
        position: isDragging ? 'relative' : undefined,
        transform: CSS.Transform.toString(transform),
        transition: transition ? 'transform 120ms linear' : undefined,
        zIndex: isDragging ? 2 : undefined,
      }}
    >
      <button
        aria-label={todo.done ? '取消完成' : '标记完成'}
        aria-pressed={todo.done}
        className={todo.done ? 'todo-check todo-check--done' : completing ? 'todo-check todo-check--completing' : 'todo-check'}
        onClick={onToggle}
        title={todo.done ? '取消完成' : '标记完成'}
        type="button"
      >
        {(todo.done || completing) && <span className="todo-check-mark">✓</span>}
      </button>
      {editing ? (
        <textarea
          aria-label="编辑待办"
          autoFocus
          className="todo-text todo-text--editing"
          onBlur={saveEditing}
          onChange={(event) => setDraft(event.target.value)}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onKeyDown={handleEditKeyDown}
          rows={1}
          value={draft}
        />
      ) : (
        <HoverText
          className={todo.done ? 'todo-text todo-text--done' : 'todo-text'}
          completing={completing}
          hoverFull={hoverFull}
          maxLines={maxLines}
          onDoubleClick={beginEditing}
          text={todo.text}
        />
      )}
      <button
        {...attributes}
        {...listeners}
        aria-label={`拖动「${todo.text}」排序`}
        className="todo-drag-handle"
        disabled={editing || completing}
        title="拖动排序"
        type="button"
      >
        ⠿
      </button>
      <button
        aria-label="删除待办"
        className="todo-delete"
        onClick={onDelete}
        title="删除待办"
        type="button"
      >
        ×
      </button>
    </div>
  );
}

function TodoWidget({ initialWidget, embedded = false }: { initialWidget: PinWidget; embedded?: boolean }) {
  const [widget, setWidget] = useState(initialWidget);
  useWidgetUpdates(setWidget);
  const [todos, setTodos] = useState<PinTodo[]>([]);
  const contextMenu = useContextMenu(!embedded);
  const [draft, setDraft] = useState('');
  const [deletedTodo, setDeletedTodo] = useState<PinTodo | null>(null);
  const [completingIds, setCompletingIds] = useState<Set<string>>(() => new Set());
  const viewSettings = useWindowDisplaySettings();
  const [listHovered, setListHovered] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.outerWidth);
  const [loaded, setLoaded] = useState(false);
  const composing = useRef(false);
  const todosRef = useRef(todos);
  const completionQueue = useRef<string[]>([]);
  const completingTodoIds = useRef(new Set<string>());
  const processingCompletion = useRef(false);
  const dragSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    todosRef.current = todos;
  }, [todos]);

  useEffect(() => {
    if (!deletedTodo) {
      return;
    }
    const timer = window.setTimeout(() => setDeletedTodo(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [deletedTodo]);

  useEffect(() => {
    let active = true;
    void window.pinApi.listTodos().then(
      (nextTodos) => {
        if (!active) {
          return;
        }
        setTodos(nextTodos ?? []);
        setLoaded(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleWindowResize = () => setWindowWidth(window.outerWidth);
    window.addEventListener('resize', handleWindowResize);
    return () => window.removeEventListener('resize', handleWindowResize);
  }, []);

  const hide = () => {
    void window.pinApi.hideWindow();
  };

  const togglePin = () => {
    void window.pinApi.setPin(!widget.pin).then((updated) => {
      if (updated) {
        setWidget(updated);
      }
    });
  };

  const toggleCollapsed = () => {
    void window.pinApi.setCollapsed(!widget.collapsed).then((updated) => {
      if (updated) {
        setWidget(updated);
      }
    });
  };

  const setOpacity = (opacity: number) => {
    void window.pinApi.setOpacity(opacity).then((updated) => {
      if (updated) {
        setWidget(updated);
      }
    });
  };

  const addTodo = () => {
    if (draft.trim() === '') {
      return;
    }
    const text = draft;
    setDraft('');
    void window.pinApi.createTodo(text).then((created) => {
      if (created) {
        setTodos((current) => [...current, created]);
      }
    });
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const isComposing = composing.current || event.nativeEvent.isComposing;
    if (event.key === 'Enter' && !event.shiftKey && !isComposing) {
      event.preventDefault();
      addTodo();
    }
  };

  const updateTodo = (todoId: string, patch: { text?: string; done?: boolean }) => {
    void window.pinApi.updateTodo(todoId, patch).then((updated) => {
      if (updated) {
        setTodos((current) => current.map((todo) => (todo.id === updated.id ? updated : todo)));
      }
    });
  };

  const processCompletionQueue = () => {
    if (processingCompletion.current) {
      return;
    }
    const todoId = completionQueue.current.shift();
    if (!todoId) {
      return;
    }
    const todo = todosRef.current.find((item) => item.id === todoId);
    if (!todo || todo.done || completingTodoIds.current.has(todoId)) {
      processCompletionQueue();
      return;
    }
    processingCompletion.current = true;
    completingTodoIds.current.add(todoId);
    setCompletingIds((current) => new Set(current).add(todoId));
    void window.pinApi.updateTodo(todoId, { done: true }).then((updated) => {
      window.setTimeout(() => {
        if (updated) {
          setTodos((current) => current.map((item) => (item.id === updated.id ? updated : item)));
        }
        setCompletingIds((current) => {
          const next = new Set(current);
          next.delete(todoId);
          return next;
        });
        completingTodoIds.current.delete(todoId);
        processingCompletion.current = false;
        processCompletionQueue();
      }, 300);
    }).catch(() => {
      setCompletingIds((current) => {
        const next = new Set(current);
        next.delete(todoId);
        return next;
      });
      completingTodoIds.current.delete(todoId);
      processingCompletion.current = false;
      processCompletionQueue();
    });
  };

  const toggleTodo = (todo: PinTodo) => {
    if (
      completingIds.has(todo.id) ||
      completingTodoIds.current.has(todo.id) ||
      completionQueue.current.includes(todo.id)
    ) {
      return;
    }
    if (todo.done) {
      updateTodo(todo.id, { done: false });
      return;
    }
    if (!completionQueue.current.includes(todo.id)) {
      completionQueue.current.push(todo.id);
      processCompletionQueue();
    }
  };

  const deleteTodo = (todoId: string) => {
    void window.pinApi.deleteTodo(todoId).then((deleted) => {
      if (deleted) {
        setTodos((current) => current.filter((todo) => todo.id !== todoId));
        setDeletedTodo(deleted);
      }
    });
  };

  const restoreTodo = () => {
    void window.pinApi.restoreTodo().then((restored) => {
      if (restored) {
        setTodos((current) =>
          [...current, restored].sort(compareTodos),
        );
      }
      setDeletedTodo(null);
    });
  };

  const openTodos = todos.filter((todo) => !todo.done);
  const completedTodos = todos.filter((todo) => todo.done);
  const scrollbarMode = windowWidth < 300 ? 'overlay' : viewSettings.scrollbar;
  const listClassName = `todo-list todo-list--${scrollbarMode}${listHovered ? ' todo-list--hovered' : ''}`;

  const reorderTodos = (group: PinTodo[], event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) {
      return;
    }
    const sourceIndex = group.findIndex((todo) => todo.id === event.active.id);
    const targetIndex = group.findIndex((todo) => todo.id === event.over?.id);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }
    const reorderedGroup = arrayMove(group, sourceIndex, targetIndex);
    const reorderedTodos = group[0]?.done
      ? [...openTodos, ...reorderedGroup]
      : [...reorderedGroup, ...completedTodos];
    const orderedIds = reorderedTodos.map((todo) => todo.id);
    setTodos(reorderedTodos);
    void window.pinApi.reorderTodos(orderedIds).then((updated) => {
      if (updated) {
        setTodos(updated);
      }
    });
  };

  return (
    <main
      className={embedded ? 'desk-panel widget-themed' : 'app widget-themed'}
      onContextMenu={!embedded ? contextMenu.handleContextMenu : undefined}
      style={widgetColorStyle(widget)}
    >
      {!embedded && <TitleBar onCollapse={toggleCollapsed} onHide={hide} onPin={togglePin} widget={widget} />}
      {!widget.collapsed && (
        <>
          <div
            className={listClassName}
            onMouseEnter={() => setListHovered(true)}
            onMouseLeave={() => setListHovered(false)}
          >
            {!loaded && <p className="app--loading">加载中…</p>}
            {loaded && (
              <DndContext
                autoScroll
                collisionDetection={closestCenter}
                onDragEnd={(event) => reorderTodos(openTodos, event)}
                sensors={dragSensors}
              >
                <SortableContext
                  items={openTodos.map((todo) => todo.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {openTodos.map((todo) => (
                    <TodoRow
                      completing={completingIds.has(todo.id)}
                      hoverFull={viewSettings.hoverFull}
                      key={todo.id}
                      maxLines={viewSettings.maxLines}
                      onDelete={() => deleteTodo(todo.id)}
                      onToggle={() => toggleTodo(todo)}
                      onUpdate={(text) => updateTodo(todo.id, { text })}
                      todo={todo}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
            {loaded && completedTodos.length > 0 && (
              <>
                <div className="todo-completed-heading">已完成 {completedTodos.length}</div>
                <DndContext
                  autoScroll
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => reorderTodos(completedTodos, event)}
                  sensors={dragSensors}
                >
                  <SortableContext
                    items={completedTodos.map((todo) => todo.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {completedTodos.map((todo) => (
                      <TodoRow
                        completing={completingIds.has(todo.id)}
                        hoverFull={viewSettings.hoverFull}
                        key={todo.id}
                        maxLines={viewSettings.maxLines}
                        onDelete={() => deleteTodo(todo.id)}
                        onToggle={() => toggleTodo(todo)}
                        onUpdate={(text) => updateTodo(todo.id, { text })}
                        todo={todo}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </>
            )}
            {deletedTodo && (
              <div className="todo-undo-row">
                <span className="todo-undo-text">已删除「{deletedTodo.text}」</span>
                <button className="todo-undo-button" onClick={restoreTodo} type="button">
                  撤销
                </button>
              </div>
            )}
          </div>
          <footer className="todo-input-row">
            <span aria-hidden="true" className="todo-input-symbol">[+]</span>
            <textarea
              aria-label="新增待办"
              className="todo-input"
              onChange={(event) => setDraft(event.target.value)}
              onCompositionEnd={() => {
                composing.current = false;
              }}
              onCompositionStart={() => {
                composing.current = true;
              }}
              onKeyDown={handleInputKeyDown}
              placeholder="写点什么…"
              rows={1}
              value={draft}
            />
          </footer>
          {!embedded && viewSettings.opacityBar && <OpacityBar onChange={setOpacity} widget={widget} />}
          {!embedded && <ResizeHandle />}
        </>
      )}
      {!embedded && <OpacityContextMenu menu={contextMenu} onChange={setOpacity} onPin={togglePin} showOpacity={!viewSettings.opacityBar} widget={widget} />}
    </main>
  );
}

function NoteWidget({ initialWidget, embedded = false }: { initialWidget: PinWidget; embedded?: boolean }) {
  const [widget, setWidget] = useState(initialWidget);
  useWidgetUpdates(setWidget);
  const contextMenu = useContextMenu(!embedded);
  const viewSettings = useWindowDisplaySettings();
  const [draft, setDraft] = useState(initialWidget.noteText);
  const [loaded, setLoaded] = useState(false);
  const draftRef = useRef(draft);

  useEffect(() => {
    let active = true;
    void window.pinApi.getWidget().then((nextWidget) => {
      if (!active || !nextWidget) {
        return;
      }
      setWidget(nextWidget);
      setDraft(nextWidget.noteText);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!loaded || draft === widget.noteText) {
      return;
    }
    const timer = window.setTimeout(() => {
      void window.pinApi.saveNote(draftRef.current).then((saved) => {
        if (saved) {
          setWidget((current) => ({ ...current, noteText: saved.noteText }));
        }
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [draft, loaded, widget.noteText]);

  const hide = () => {
    void window.pinApi.hideWindow();
  };

  const togglePin = () => {
    void window.pinApi.setPin(!widget.pin).then((updated) => {
      if (updated) {
        setWidget(updated);
      }
    });
  };

  const toggleCollapsed = () => {
    void window.pinApi.setCollapsed(!widget.collapsed).then((updated) => {
      if (updated) {
        setWidget(updated);
      }
    });
  };

  const setOpacity = (opacity: number) => {
    void window.pinApi.setOpacity(opacity).then((updated) => {
      if (updated) {
        setWidget(updated);
      }
    });
  };

  return (
    <main
      className={embedded ? 'desk-panel widget-themed' : 'app widget-themed'}
      onContextMenu={!embedded ? contextMenu.handleContextMenu : undefined}
      style={widgetColorStyle(widget)}
    >
      {!embedded && <TitleBar onCollapse={toggleCollapsed} onHide={hide} onPin={togglePin} widget={widget} />}
      {!widget.collapsed && (
        <>
          <textarea
            aria-label="便签正文"
            className="note-editor"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="写点什么…"
            value={draft}
          />
          {!embedded && viewSettings.opacityBar && <OpacityBar onChange={setOpacity} widget={widget} />}
          {!embedded && <ResizeHandle />}
        </>
      )}
      {!embedded && <OpacityContextMenu menu={contextMenu} onChange={setOpacity} onPin={togglePin} showOpacity={!viewSettings.opacityBar} widget={widget} />}
    </main>
  );
}

const DESK_TAB_OPTIONS: Array<{ id: PinWidget['activeTab']; label: string }> = [
  { id: 'note', label: 'NOTE' },
  { id: 'todo', label: 'TODO' },
  { id: 'clip', label: 'CLIP' },
];

function DeskWidget({ initialWidget }: { initialWidget: PinWidget }) {
  const [widget, setWidget] = useState(initialWidget);
  useWidgetUpdates(setWidget);
  const contextMenu = useContextMenu(true);
  const viewSettings = useWindowDisplaySettings();

  useEffect(() => {
    let active = true;
    void window.pinApi.getWidget().then((nextWidget) => {
      if (active && nextWidget) {
        setWidget(nextWidget);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const hide = () => {
    void window.pinApi.hideWindow();
  };

  const togglePin = () => {
    void window.pinApi.setPin(!widget.pin).then((updated) => {
      if (updated) {
        setWidget(updated);
      }
    });
  };

  const toggleCollapsed = () => {
    void window.pinApi.setCollapsed(!widget.collapsed).then((updated) => {
      if (updated) {
        setWidget(updated);
      }
    });
  };

  const setOpacity = (opacity: number) => {
    void window.pinApi.setOpacity(opacity).then((updated) => {
      if (updated) {
        setWidget(updated);
      }
    });
  };

  const selectTab = (activeTab: PinWidget['activeTab']) => {
    if (activeTab === widget.activeTab) {
      return;
    }
    void window.pinApi.setActiveTab(activeTab).then((updated) => {
      if (updated) {
        setWidget(updated);
      }
    });
  };

  return (
    <main className="app widget-themed" onContextMenu={contextMenu.handleContextMenu} style={widgetColorStyle(widget)}>
      <TitleBar onCollapse={toggleCollapsed} onHide={hide} onPin={togglePin} widget={widget} />
      {!widget.collapsed && (
        <>
          <nav aria-label="DESK 标签页" className="desk-tabs">
            {DESK_TAB_OPTIONS.map((tab) => (
              <button
                aria-selected={widget.activeTab === tab.id}
                className={widget.activeTab === tab.id ? 'desk-tab desk-tab--active' : 'desk-tab'}
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <section className="desk-content">
            {widget.activeTab === 'note' && <NoteWidget embedded initialWidget={widget} />}
            {widget.activeTab === 'todo' && <TodoWidget embedded initialWidget={widget} />}
            {widget.activeTab === 'clip' && <ClipWidget embedded initialWidget={widget} />}
          </section>
          {viewSettings.opacityBar && <OpacityBar onChange={setOpacity} widget={widget} />}
          <ResizeHandle />
        </>
      )}
      <OpacityContextMenu menu={contextMenu} onChange={setOpacity} onPin={togglePin} showOpacity={!viewSettings.opacityBar} widget={widget} />
    </main>
  );
}

function UnsupportedWidget({ widget }: { widget: PinWidget }) {
  const [currentWidget, setCurrentWidget] = useState(widget);

  const togglePin = () => {
    void window.pinApi.setPin(!currentWidget.pin).then((updated) => {
      if (updated) {
        setCurrentWidget(updated);
      }
    });
  };

  const toggleCollapsed = () => {
    void window.pinApi.setCollapsed(!currentWidget.collapsed).then((updated) => {
      if (updated) {
        setCurrentWidget(updated);
      }
    });
  };

  return (
    <main className="app widget-themed" style={widgetColorStyle(currentWidget)}>
      <TitleBar
        onCollapse={toggleCollapsed}
        onHide={() => void window.pinApi.hideWindow()}
        onPin={togglePin}
        widget={currentWidget}
      />
      {!currentWidget.collapsed && (
        <>
          <p className="placeholder">{currentWidget.type.toUpperCase()} 即将可用</p>
          <ResizeHandle />
        </>
      )}
    </main>
  );
}

function WidgetApp() {
  const [widget, setWidget] = useState<PinWidget | null>(null);

  useEffect(() => {
    void window.pinApi.getWidget().then(setWidget);
  }, []);

  if (!widget) {
    return <main className="app app--loading">加载中…</main>;
  }
  if (widget.type === 'note') {
    return <NoteWidget initialWidget={widget} />;
  }
  if (widget.type === 'todo') {
    return <TodoWidget initialWidget={widget} />;
  }
  if (widget.type === 'clip') {
    return <ClipWidget initialWidget={widget} />;
  }
  if (widget.type === 'desk') {
    return <DeskWidget initialWidget={widget} />;
  }
  return <UnsupportedWidget widget={widget} />;
}

function App() {
  const context = getWindowContext();
  if (context.role === 'onboarding') {
    return <Onboarding />;
  }
  if (context.role === 'manager') {
    return <Manager />;
  }
  if (context.role === 'settings') {
    return <SettingsPanel />;
  }
  if (context.role === 'colors') {
    return <ColorsPanel />;
  }
  return <WidgetApp />;
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Renderer root element is missing');
}

createRoot(root).render(<App />);
