import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';

import './styles/global.scss';

type WidgetType = PinWidget['type'];

function getWindowContext() {
  const params = new URLSearchParams(window.location.search);
  return {
    role: params.get('role') ?? 'unknown',
    id: params.get('id') ?? 'unknown',
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

const DEFAULT_TODO_SETTINGS: PinSettings = {
  maxLines: 0,
  hoverFull: true,
  scrollbar: 'overlay',
};

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

function ManagerTitleBar({ count, onHide }: { count: number; onHide: () => void }) {
  return (
    <header className="manager-titlebar">
      <span className="type-label">WIDGETS · {count}</span>
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
    }
  };

  useEffect(() => {
    void reload();
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
      <ManagerTitleBar count={widgets.length} onHide={() => void window.pinApi.hideManager()} />
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

function TitleBar({ widget, onHide, onPin, onCollapse }: {
  widget: PinWidget;
  onHide: () => void;
  onPin: () => void;
  onCollapse: () => void;
}) {
  return (
    <header
      className="titlebar"
      onDoubleClick={onCollapse}
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
  const [items, setItems] = useState<PinClipItem[]>([]);
  const [draft, setDraft] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletedClip, setDeletedClip] = useState<PinClipItem | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [viewSettings, setViewSettings] = useState(DEFAULT_TODO_SETTINGS);
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
    void Promise.all([window.pinApi.listClips(), window.pinApi.getSettings()]).then(
      ([nextItems, nextSettings]) => {
        if (!active) {
          return;
        }
        setItems(nextItems ?? []);
        setViewSettings(nextSettings);
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
    <main className={embedded ? 'desk-panel' : 'app'}>
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
          {!embedded && <OpacityBar onChange={setOpacity} widget={widget} />}
          {!embedded && <ResizeHandle />}
        </>
      )}
    </main>
  );
}

function TodoRow({
  todo,
  onToggle,
  onDelete,
  onUpdate,
  dragging,
  dragOver,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  maxLines,
  hoverFull,
  completing,
}: {
  todo: PinTodo;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (text: string) => void;
  dragging: boolean;
  dragOver: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  maxLines: number;
  hoverFull: boolean;
  completing: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.text);
  const composing = useRef(false);
  const suppressBlur = useRef(false);

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
      className={`${todo.done ? 'todo-row todo-row--done' : 'todo-row'}${completing ? ' todo-row--completing' : ''}${dragging ? ' todo-row--dragging' : ''}${dragOver ? ' todo-row--drag-over' : ''}`}
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
      <span
        aria-hidden="true"
        className="todo-drag-handle"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          onDragStart();
        }}
      >
        ⠿
      </span>
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
  const [todos, setTodos] = useState<PinTodo[]>([]);
  const [draft, setDraft] = useState('');
  const [deletedTodo, setDeletedTodo] = useState<PinTodo | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [completingIds, setCompletingIds] = useState<Set<string>>(() => new Set());
  const [viewSettings, setViewSettings] = useState(DEFAULT_TODO_SETTINGS);
  const [listHovered, setListHovered] = useState(false);
  const [windowWidth, setWindowWidth] = useState(window.outerWidth);
  const [loaded, setLoaded] = useState(false);
  const composing = useRef(false);
  const todosRef = useRef(todos);
  const completionQueue = useRef<string[]>([]);
  const completingTodoIds = useRef(new Set<string>());
  const processingCompletion = useRef(false);

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
    void Promise.all([window.pinApi.listTodos(), window.pinApi.getSettings()]).then(
      ([nextTodos, nextSettings]) => {
        if (!active) {
          return;
        }
        setTodos(nextTodos ?? []);
        setViewSettings(nextSettings);
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
  const displayedTodos = [...openTodos, ...completedTodos];
  const scrollbarMode = windowWidth < 300 ? 'overlay' : viewSettings.scrollbar;
  const listClassName = `todo-list todo-list--${scrollbarMode}${listHovered ? ' todo-list--hovered' : ''}`;

  const reorderTodos = (targetId: string) => {
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setDragOverId(null);
      return;
    }
    const orderedIds = displayedTodos.map((todo) => todo.id);
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
    void window.pinApi.reorderTodos(orderedIds).then((updated) => {
      if (updated) {
        setTodos(updated);
      }
    });
  };

  const clearDrag = () => {
    setDragId(null);
    setDragOverId(null);
  };

  return (
    <main className={embedded ? 'desk-panel' : 'app'}>
      {!embedded && <TitleBar onCollapse={toggleCollapsed} onHide={hide} onPin={togglePin} widget={widget} />}
      {!widget.collapsed && (
        <>
          <div
            className={listClassName}
            onMouseEnter={() => setListHovered(true)}
            onMouseLeave={() => setListHovered(false)}
          >
            {!loaded && <p className="app--loading">加载中…</p>}
            {loaded && openTodos.map((todo) => (
              <TodoRow
                dragOver={dragOverId === todo.id}
                dragging={dragId === todo.id}
                completing={completingIds.has(todo.id)}
                hoverFull={viewSettings.hoverFull}
                key={todo.id}
                maxLines={viewSettings.maxLines}
                onDragEnd={clearDrag}
                onDragOver={() => setDragOverId(todo.id)}
                onDragStart={() => setDragId(todo.id)}
                onDrop={() => reorderTodos(todo.id)}
                onDelete={() => deleteTodo(todo.id)}
                onToggle={() => toggleTodo(todo)}
                onUpdate={(text) => updateTodo(todo.id, { text })}
                todo={todo}
              />
            ))}
            {loaded && completedTodos.length > 0 && (
              <>
                <div className="todo-completed-heading">已完成 {completedTodos.length}</div>
                {completedTodos.map((todo) => (
                  <TodoRow
                    dragOver={dragOverId === todo.id}
                    dragging={dragId === todo.id}
                    completing={completingIds.has(todo.id)}
                    hoverFull={viewSettings.hoverFull}
                    key={todo.id}
                    maxLines={viewSettings.maxLines}
                    onDragEnd={clearDrag}
                    onDragOver={() => setDragOverId(todo.id)}
                    onDragStart={() => setDragId(todo.id)}
                    onDrop={() => reorderTodos(todo.id)}
                    onDelete={() => deleteTodo(todo.id)}
                    onToggle={() => toggleTodo(todo)}
                    onUpdate={(text) => updateTodo(todo.id, { text })}
                    todo={todo}
                  />
                ))}
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
          {!embedded && <OpacityBar onChange={setOpacity} widget={widget} />}
          {!embedded && <ResizeHandle />}
        </>
      )}
    </main>
  );
}

function NoteWidget({ initialWidget, embedded = false }: { initialWidget: PinWidget; embedded?: boolean }) {
  const [widget, setWidget] = useState(initialWidget);
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
    <main className={embedded ? 'desk-panel' : 'app'}>
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
          {!embedded && <OpacityBar onChange={setOpacity} widget={widget} />}
          {!embedded && <ResizeHandle />}
        </>
      )}
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
    <main className="app">
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
          <OpacityBar onChange={setOpacity} widget={widget} />
          <ResizeHandle />
        </>
      )}
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
    <main className="app">
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
  return <WidgetApp />;
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Renderer root element is missing');
}

createRoot(root).render(<App />);
