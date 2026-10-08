import { useWindowDrag } from '../hooks/use-window-drag';
import { Settings, X, Eye, EyeOff, Trash2, Plus, ChevronUp, ChevronDown } from 'lucide-react';
import { type PinWidget } from '../../shared/types';
import { widgetDisplayName, type WidgetType, MANAGER_FILTER_OPTIONS, WIDGET_OPTIONS } from '../widget-utils';
import { useState, useEffect } from 'react';
import { getWindowContext } from '../window-context';
import { OverlayScrollArea } from '../components/OverlayScrollArea';

function ManagerTitleBar({ count, onHide, onSettings }: { count: number; onHide: () => void; onSettings: () => void }) {
  const drag = useWindowDrag();

  return (
    <header className="manager-titlebar" {...drag}>
      <span className="type-label">WIDGETS · {count}</span>
      <button
        aria-label="打开设置"
        className="title-action title-action--icon"
        onClick={onSettings}
        title="设置"
        type="button"
      >
        <Settings aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
      </button>
      <button
        aria-label="关闭管理面板"
        className="title-action title-action--icon"
        onClick={onHide}
        title="关闭管理面板"
        type="button"
      >
        <X aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
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
        {widget.hidden ? (
          <Eye aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
        ) : (
          <EyeOff aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
        )}
      </button>
      <button
        aria-label={`删除 ${widgetDisplayName(widget)}`}
        className="manager-action manager-action--icon manager-delete-action"
        disabled={disabled}
        onClick={() => onDeleteRequest(widget)}
        title="删除窗口"
        type="button"
      >
        <Trash2 aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

export function Manager() {
  const [widgets, setWidgets] = useState<PinWidget[]>([]);
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
    <main className="app manager-app">
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
      <OverlayScrollArea aria-label="窗口列表" className="manager-list">
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
      </OverlayScrollArea>
      <footer className="manager-footer">
        <div className="manager-visibility-actions">
          <button disabled={busy} onClick={() => void setAllHidden(false)} type="button">
            <Eye aria-hidden="true" className="ui-icon" size={13} strokeWidth={2} />
            全部显示
          </button>
          <button disabled={busy} onClick={() => void setAllHidden(true)} type="button">
            <EyeOff aria-hidden="true" className="ui-icon" size={13} strokeWidth={2} />
            全部隐藏
          </button>
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
            <Plus aria-hidden="true" className="ui-icon" size={13} strokeWidth={2} />
            NEW
            {newMenuOpen ? (
              <ChevronUp aria-hidden="true" className="ui-icon" size={13} strokeWidth={2} />
            ) : (
              <ChevronDown aria-hidden="true" className="ui-icon" size={13} strokeWidth={2} />
            )}
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
