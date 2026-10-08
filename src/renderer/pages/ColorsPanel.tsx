import { ChevronLeft, Pencil, Trash2, Plus, Save } from 'lucide-react';
import { type PinCustomKit, type PinColorContext, type PinColorSet } from '../../shared/types';
import { useRef, useLayoutEffect, useState, useEffect } from 'react';
import { getWindowContext } from '../window-context';
import { normalizeKitColors, COLOR_PRESETS } from '../../shared/colors';
import { OverlayScrollArea } from '../../components/overlay-scroll-area';
import { ColorSwatches } from '../components/ColorSwatches';

type EditableColorPart = 'paper' | 'accent' | 'ink';

const COLOR_PARTS: Array<{ id: EditableColorPart; label: string }> = [
  { id: 'paper', label: '背景色' },
  { id: 'accent', label: '强调色' },
  { id: 'ink', label: '文字色' },
];

function ColorsTitleBar({
  onBack,
  title,
  disabled = false,
}: {
  onBack?: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <header className="colors-titlebar">
      <span className="type-label">COLORS · {title}</span>
      {onBack && (
        <button
          aria-label="返回套装列表"
          className="title-action title-action--icon"
          disabled={disabled}
          onClick={onBack}
          title="返回套装列表"
          type="button"
        >
          <ChevronLeft aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
        </button>
      )}
    </header>
  );
}

function ColorKitDeleteDialog({ kit, busy, error, onCancel, onConfirm }: {
  kit: PinCustomKit;
  busy: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => { dialog?.close(); };
  }, []);

  return (
    <dialog
      aria-describedby="color-kit-delete-description"
      aria-labelledby="color-kit-delete-title"
      className="manager-confirm color-kit-confirm"
      onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}
      ref={dialogRef}
    >
      <h2 id="color-kit-delete-title">删除配色套装？</h2>
      <p id="color-kit-delete-description">确定删除“{kit.name}”？</p>
      {error && <p className="color-kit-delete-error" role="alert">{error}</p>}
      <div className="manager-confirm-actions">
        <button autoFocus disabled={busy} onClick={onCancel} type="button">取消</button>
        <button className="manager-confirm-delete" disabled={busy} onClick={onConfirm} type="button">
          {busy ? '删除中…' : '删除'}
        </button>
      </div>
    </dialog>
  );
}

export function ColorsPanel() {
  const [context, setContext] = useState<PinColorContext | null>(null);
  const [kits, setKits] = useState<PinCustomKit[]>([]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<'kits' | 'custom'>('kits');
  const [editorBaseColors, setEditorBaseColors] = useState<PinColorSet | null>(null);
  const [draftColors, setDraftColors] = useState<PinColorSet | null>(null);
  const [kitName, setKitName] = useState('');
  const [editingKitId, setEditingKitId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState('');
  const [pendingDeleteKit, setPendingDeleteKit] = useState<PinCustomKit | null>(null);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    if (view === 'custom' && draftColors) {
      void window.pinApi.previewColorKit(draftColors).catch(() => setSaveError('预览失败，请重试'));
    }
  }, [view, draftColors]);

  useEffect(() => {
    if (view !== 'custom') return;
    return () => { void window.pinApi.endColorPreview().catch((): void => undefined); };
  }, [view]);

  const reload = async () => {
    const nextContext = await window.pinApi.getColorContext();
    setContext(nextContext);
  };

  useEffect(() => {
    let active = true;
    const unsubscribe = window.pinApi.onSettingsChanged(() => {
      if (active) {
        void reload();
      }
    });
    const unsubscribeDeleted = window.pinApi.onWidgetDeleted((widgetId) => {
      if (!active) return;
      const windowContext = getWindowContext();
      if (windowContext.scope === 'widget' && windowContext.widgetId === widgetId) {
        setContext(null);
        setView('kits');
      } else {
        void reload();
      }
    });
    const unsubscribeWidget = window.pinApi.onWidgetChanged(() => {
      if (active) void reload();
    });
    void Promise.all([
      window.pinApi.getColorContext(),
      window.pinApi.listColorKits(),
    ]).then(
      ([nextContext, nextKits]) => {
        if (!active) {
          return;
        }
        setContext(nextContext);
        setKits(nextKits ?? []);
      },
    );
    return () => {
      active = false;
      unsubscribe();
      unsubscribeDeleted();
      unsubscribeWidget();
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
    if (!draftColors || busy) {
      return;
    }
    const name = kitName.trim();
    if (!name) {
      setSaveError('请输入套装名称');
      return;
    }
    setBusy(true);
    setSaveError('');
    try {
      const saved = editingKitId
        ? await window.pinApi.updateColorKit(editingKitId, name, draftColors)
        : await window.pinApi.createColorKit(name, draftColors);
      if (!saved) {
        setSaveError('保存失败，请重试');
        return;
      }
      setKits((current) => current.some((kit) => kit.id === saved.id)
        ? current.map((kit) => kit.id === saved.id ? saved : kit)
        : [...current, saved]);
      setEditingKitId(saved.id);
      const applied = await window.pinApi.applyColorKit(saved.id);
      if (!applied) {
        setSaveError('套装已保存，应用失败，请重试');
        return;
      }
      await window.pinApi.endColorPreview();
      await reload();
      setView('kits');
    } catch {
      setSaveError('保存失败，请重试');
    } finally {
      setBusy(false);
    }
  };

  const deleteKit = async (kit: PinCustomKit) => {
    if (busy) return;
    setBusy(true);
    setDeleteError('');
    try {
      const deleted = await window.pinApi.deleteColorKit(kit.id);
      if (deleted) {
        setKits((current) => current.filter((item) => item.id !== deleted.id));
        setPendingDeleteKit(null);
        await reload();
      } else {
        setDeleteError('删除失败，请重试');
      }
    } catch {
      setDeleteError('删除失败，请重试');
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

  const openCustomEditor = (kit?: PinCustomKit) => {
    const colors = kit ?? context?.colors;
    if (!colors) {
      return;
    }
    setEditorBaseColors(normalizeKitColors(colors));
    setDraftColors(normalizeKitColors(colors));
    setKitName(kit?.name ?? '');
    setEditingKitId(kit?.id ?? null);
    setSaveError('');
    setView('custom');
  };

  const updatePart = (part: EditableColorPart, value: string) => {
    setDraftColors((colors) => colors ? normalizeKitColors({ ...colors, [part]: value }) : colors);
  };

  const currentColors = context?.colors;
  const isWidgetScope = context?.scope === 'widget';
  const currentKitId = context?.activeKitId;
  const currentKit = kits.find((kit) => kit.id === currentKitId);
  const currentPreset = COLOR_PRESETS.find((preset) => preset.id === context?.activePresetId);
  const title = currentKit?.name ?? currentPreset?.name ?? '自定义';
  return (
    <main className="app colors-app">
      <ColorsTitleBar
        disabled={busy}
        onBack={view === 'custom' ? () => setView('kits') : () => void window.pinApi.openSettings()}
        title={title}
      />
      {view === 'kits' ? (
        <OverlayScrollArea className="colors-section">
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
              <span className="color-preset-name" title={preset.name}>{preset.name}</span>
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
                <span className="color-preset-name" title={kit.name}>{kit.name}</span>
                {currentKitId === kit.id && <span className="color-preset-current">当前</span>}
              </button>
              <button
                aria-label={`编辑 ${kit.name}`}
                className="color-kit-action"
                disabled={busy}
                onClick={() => openCustomEditor(kit)}
                title="编辑套装"
                type="button"
              >
                <Pencil aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
              </button>
              <button
                aria-label={`删除 ${kit.name}`}
                className="color-kit-action color-kit-action--delete"
                disabled={busy}
                onClick={() => { setDeleteError(''); setPendingDeleteKit(kit); }}
                title="删除套装"
                type="button"
              >
                <Trash2 aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
              </button>
            </div>
          ))}
          <button className="color-custom-placeholder" disabled={busy || !currentColors} onClick={() => openCustomEditor()} type="button">
            <Plus aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
            自定义
          </button>
        </OverlayScrollArea>
      ) : (
        <OverlayScrollArea className="colors-section colors-custom-section">
          <h2>{editingKitId ? '编辑套装' : '新建套装'}</h2>
          <div className="color-parts-list">
            {COLOR_PARTS.map((part) => {
              const value = draftColors?.[part.id] ?? '#111111';
              return (
                <label className="color-part" key={part.id}>
                  <span>{part.label}</span>
                  <span className="color-part-value">
                    <input
                      aria-label={part.label}
                      className="color-part-picker"
                      disabled={busy || !draftColors}
                      onChange={(event) => updatePart(part.id, event.target.value)}
                      title={part.label}
                      type="color"
                      value={value}
                    />
                    <span>{value.toUpperCase()}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <form className="color-kit-form" onSubmit={(event) => { event.preventDefault(); void saveKit(); }}>
            <label htmlFor="color-kit-name">套装名称</label>
            <input
              aria-describedby={saveError ? 'color-kit-error' : undefined}
              aria-invalid={Boolean(saveError)}
              autoComplete="off"
              disabled={busy}
              id="color-kit-name"
              maxLength={80}
              onChange={(event) => { setKitName(event.target.value); setSaveError(''); }}
              placeholder="我的套装"
              value={kitName}
            />
            {saveError && <p className="color-kit-error" id="color-kit-error" role="alert">{saveError}</p>}
            <div className="color-kit-form-actions">
              <button disabled={busy || !editorBaseColors} onClick={() => setDraftColors(editorBaseColors)} type="button">还原</button>
              <button className="color-kit-save" disabled={busy || !draftColors} type="submit">
                <Save aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
                {busy ? '保存中…' : '保存套装'}
              </button>
            </div>
          </form>
        </OverlayScrollArea>
      )}
      <footer className="colors-footer">
        <span>
          {currentColors
            ? view === 'custom'
              ? '预览中 · 尚未保存'
              : Number.isFinite(context.appliedWindowCount)
                ? `已应用到 ${context.appliedWindowCount} 个窗口`
                : '已应用'
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
      </footer>
      {pendingDeleteKit && (
        <ColorKitDeleteDialog
          busy={busy}
          error={deleteError}
          kit={pendingDeleteKit}
          onCancel={() => setPendingDeleteKit(null)}
          onConfirm={() => void deleteKit(pendingDeleteKit)}
        />
      )}
    </main>
  );
}
