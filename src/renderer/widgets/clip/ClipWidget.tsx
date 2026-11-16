import { MAX_CLIP_ITEMS, type PinClipItem, type PinNote, type PinWidget } from '../../../shared/types';
import { Fragment, useState, useRef, useEffect } from 'react';
import { OverlayScrollArea } from '../../components/OverlayScrollArea';
import { ImageDocumentEditor } from '../../components/ImageDocumentEditor';
import { HoverText } from '../../components/HoverText';
import { Check, Copy, GripVertical, Trash2 } from 'lucide-react';
import { splitImageDocument } from '../../components/image-document';
import { useWidgetUpdates } from '../../hooks/use-widget-updates';
import { useContextMenu, OpacityContextMenu } from '../../components/OpacityContextMenu';
import { useWindowDisplaySettings } from '../../hooks/use-window-display-settings';
import { useOpacityControl } from '../../hooks/use-opacity-control';
import { useWidgetColorStyle } from '../../colors/widget-colors';
import { TitleBar, OpacityBar } from '../../components/WidgetChrome';

function compareClips(left: PinClipItem, right: PinClipItem) {
  return left.sortOrder - right.sortOrder || left.createdAt - right.createdAt || left.id.localeCompare(right.id);
}

function putClip(items: PinClipItem[], item: PinClipItem) {
  const otherItems = items.filter(({ id }) => id !== item.id).sort(compareClips);
  return [...otherItems.slice(-(MAX_CLIP_ITEMS - 1)), item].sort(compareClips);
}

const EMPTY_CLIP: PinNote = { text: '', images: [] };

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
  onUpdate: (document: PinNote) => Promise<boolean>;
  dragging: boolean;
  dragOver: boolean;
  onDragStart: () => void;
  onDragOver: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  hoverFull: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const saving = useRef(false);
  const contentLabel = item.images.length ? (item.text.trim() ? '剪贴图文' : '剪贴图片') : '剪贴文本';

  const beginEditing = () => {
    setSaveError(false);
    setEditing(true);
  };

  const saveEditing = async (document: PinNote) => {
    if (saving.current) return;
    const sameImages = item.images.length === document.images.length
      && item.images.every(({ id, offset }, index) => id === document.images[index].id && offset === document.images[index].offset);
    if ((item.text === document.text && sameImages) || (!document.text.trim() && !document.images.length)) {
      setEditing(false);
      return;
    }
    saving.current = true;
    setBusy(true);
    setSaveError(false);
    try {
      if (await onUpdate(document)) setEditing(false);
      else setSaveError(true);
    } catch {
      setSaveError(true);
    } finally {
      saving.current = false;
      setBusy(false);
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
        <div className="clip-edit-field" onClick={(event) => event.stopPropagation()}>
          <ImageDocumentEditor
            autoFocus
            busy={busy}
            footer={saveError && <span role="alert">保存失败，请重试</span>}
            initial={item}
            mode="clip-edit"
            onCancel={() => { if (!saving.current) setEditing(false); }}
            onCommit={(document) => { void saveEditing(document); }}
          />
        </div>
      ) : item.images.length ? (
        <div className="clip-text clip-document" onDoubleClick={beginEditing}>
          {splitImageDocument(item).map(({ text, image }) => (
            <Fragment key={image?.id ?? 'last'}>
              {text}
              {image && <img alt="剪贴图片" className="content-image-thumbnail inline-editor-image" draggable={false} src={image.src} />}
            </Fragment>
          ))}
        </div>
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
        aria-label={copied ? '已复制' : `复制${contentLabel}`}
        className={copied ? 'clip-copy-mark clip-copy-mark--copied' : 'clip-copy-mark'}
        onClick={(event) => {
          event.stopPropagation();
          onCopy();
        }}
        title={copied ? '已复制' : `复制${contentLabel}`}
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
        aria-label={`删除${contentLabel}`}
        className="clip-delete"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
        title={`删除${contentLabel}`}
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
  const [composerVersion, setComposerVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletedClip, setDeletedClip] = useState<PinClipItem | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const viewSettings = useWindowDisplaySettings();
  const [loaded, setLoaded] = useState(false);
  const creatingClip = useRef(false);

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

  const addClip = async (document: PinNote) => {
    if (creatingClip.current || (!document.text.trim() && !document.images.length)) return;
    creatingClip.current = true;
    setCreating(true);
    setCreateError(false);
    try {
      const created = await window.pinApi.createClip(document);
      if (created) {
        setItems((current) => putClip(current, created));
        setComposerVersion((version) => version + 1);
      } else {
        setCreateError(true);
      }
    } catch {
      setCreateError(true);
    } finally {
      creatingClip.current = false;
      setCreating(false);
    }
  };

  const copyClip = (clipId: string) => {
    void window.pinApi.copyClip(clipId).then((copied) => {
      if (copied) {
        setCopiedId(copied.id);
      }
    });
  };

  const updateClip = async (clipId: string, document: PinNote) => {
    const updated = await window.pinApi.updateClip(clipId, document);
    if (!updated) return false;
    setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    return true;
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
        setItems((current) => putClip(current, restored));
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
          <OverlayScrollArea aria-label="剪贴内容列表" className="clip-list">
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
                onUpdate={(document) => updateClip(item.id, document)}
              />
            ))}
            {deletedClip && (
              <div className="clip-undo-row">
                <span className="clip-undo-text">已删除「{deletedClip.text.trim() ? splitImageDocument(deletedClip).map(({ text }) => text).join('') : '剪贴图片'}」</span>
                <button className="clip-undo-button" onClick={restoreClip} type="button">
                  撤销
                </button>
              </div>
            )}
          </OverlayScrollArea>
          <footer className="clip-input-row">
            <span aria-hidden="true" className="clip-input-symbol">[+]</span>
            <ImageDocumentEditor
              autoFocus={composerVersion > 0}
              busy={creating || !loaded}
              footer={createError && <span role="alert">保存失败，请重试</span>}
              initial={EMPTY_CLIP}
              key={composerVersion}
              mode="clip-create"
              onCommit={(document) => { void addClip(document); }}
            />
          </footer>
          {!embedded && viewSettings.opacityBar && <OpacityBar onChange={setOpacity} widget={widget} />}
        </>
      )}
      {!embedded && <OpacityContextMenu menu={contextMenu} onChange={setOpacity} onPin={togglePin} showOpacity={!viewSettings.opacityBar} widget={widget} />}
    </main>
  );
}
