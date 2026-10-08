import type * as React from 'react';
import { type PinClipItem, type PinWidget } from '../../../shared/types';
import { useState, useRef, useEffect } from 'react';
import { OverlayTextarea, OverlayScrollArea } from '../../components/OverlayScrollArea';
import { HoverText } from '../../components/HoverText';
import { Check, Copy, GripVertical, Trash2 } from 'lucide-react';
import { useWidgetUpdates } from '../../hooks/use-widget-updates';
import { useContextMenu, OpacityContextMenu } from '../../components/OpacityContextMenu';
import { useWindowDisplaySettings } from '../../hooks/use-window-display-settings';
import { useOpacityControl } from '../../hooks/use-opacity-control';
import { useWidgetColorStyle } from '../../colors/widget-colors';
import { TitleBar, OpacityBar, ResizeHandle } from '../../components/WidgetChrome';

function compareClips(left: PinClipItem, right: PinClipItem) {
  return left.sortOrder - right.sortOrder || left.createdAt - right.createdAt || left.id.localeCompare(right.id);
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
      className={`clip-row${dragging ? ' clip-row--dragging' : ''}${dragOver ? ' clip-row--drag-over' : ''}`}
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
        <OverlayTextarea
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
      <button
        aria-label={copied ? '已复制' : '复制剪贴文本'}
        className={copied ? 'clip-copy-mark clip-copy-mark--copied' : 'clip-copy-mark'}
        onClick={(event) => {
          event.stopPropagation();
          onCopy();
        }}
        title={copied ? '已复制' : '复制剪贴文本'}
        type="button"
      >
        {copied ? (
          <Check aria-hidden="true" className="ui-icon" size={13} strokeWidth={2} />
        ) : (
          <Copy aria-hidden="true" className="ui-icon" size={13} strokeWidth={2} />
        )}
      </button>
      <span
        aria-hidden="true"
        className="clip-drag-handle"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          onDragStart();
        }}
      >
        <GripVertical aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
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
        <Trash2 aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

export function ClipWidget({ initialWidget, embedded = false }: { initialWidget: PinWidget; embedded?: boolean }) {
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

  const setOpacity = useOpacityControl(setWidget);

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

  return (
    <main
      className={embedded ? 'desk-panel widget-themed' : 'app widget-themed'}
      onContextMenu={!embedded ? contextMenu.handleContextMenu : undefined}
      style={useWidgetColorStyle(widget)}
    >
      {!embedded && <TitleBar onCollapse={toggleCollapsed} onHide={hide} onPin={togglePin} widget={widget} />}
      {!widget.collapsed && (
        <>
          <OverlayScrollArea aria-label="剪贴文本列表" className="clip-list">
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
          </OverlayScrollArea>
          <footer className="clip-input-row">
            <span aria-hidden="true" className="clip-input-symbol">[+]</span>
            <OverlayTextarea
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
