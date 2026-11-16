import { type Modifier, useSensors, useSensor, PointerSensor, KeyboardSensor, type DragEndEvent, DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import { type PinNote, type PinTodo, type PinTodoUpdate, type PinWidget } from '../../../shared/types';
import { Fragment, useState, useRef, useEffect } from 'react';
import { useSortable, sortableKeyboardCoordinates, arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical, Trash2 } from 'lucide-react';
import { OverlayScrollArea } from '../../components/OverlayScrollArea';
import { ImageDocumentEditor } from '../../components/ImageDocumentEditor';
import { ImagePreview } from '../../components/ImagePreview';
import { splitImageDocument } from '../../components/image-document';
import { HoverText } from '../../components/HoverText';
import { useWidgetColorStyle } from '../../colors/widget-colors';
import { useWidgetUpdates } from '../../hooks/use-widget-updates';
import { useContextMenu, OpacityContextMenu } from '../../components/OpacityContextMenu';
import { useWindowDisplaySettings } from '../../hooks/use-window-display-settings';
import { useOpacityControl } from '../../hooks/use-opacity-control';
import { TitleBar, OpacityBar } from '../../components/WidgetChrome';

const TODO_DRAG_MODIFIERS: Modifier[] = [
  ({ transform }) => ({ ...transform, x: 0 }),
];

const TODO_SORT_TRANSITION = {
  duration: 120,
  easing: 'linear',
};

const EMPTY_TODO: PinNote = { text: '', images: [] };

function compareTodos(left: PinTodo, right: PinTodo) {
  return left.sortOrder - right.sortOrder || left.createdAt - right.createdAt || left.id.localeCompare(right.id);
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
  onUpdate: (document: PinNote) => Promise<boolean>;
  maxLines: number;
  hoverFull: boolean;
  completing: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const document = { text: todo.text, images: todo.images ?? [] };
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    id: todo.id,
    disabled: editing || completing,
    animateLayoutChanges: () => false,
    transition: TODO_SORT_TRANSITION,
  });

  const beginEditing = () => {
    setSaveError(false);
    setEditing(true);
  };

  const saveEditing = async (next: PinNote) => {
    if (saving.current) return;
    const sameImages = document.images.length === next.images.length
      && document.images.every((image, index) => image.id === next.images[index].id && image.offset === next.images[index].offset);
    if ((next.text === todo.text && sameImages) || (!next.text.trim() && next.images.length === 0)) {
      setEditing(false);
      return;
    }
    const savedIds = new Set(document.images.map(({ id }) => id));
    const images = next.images.map(({ id, offset, src }) => ({ id, offset, src: savedIds.has(id) ? undefined : src }));
    saving.current = true;
    setBusy(true);
    setSaveError(false);
    try {
      if (await onUpdate({ text: next.text, images })) setEditing(false);
      else setSaveError(true);
    } catch {
      setSaveError(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };

  const textClass = todo.done ? 'todo-text todo-text--done' : 'todo-text';

  return (
    <div
      className={`${todo.done ? 'todo-row todo-row--done' : 'todo-row'}${completing ? ' todo-row--completing' : ''}${isDragging ? ' todo-row--dragging' : ''}`}
      ref={setNodeRef}
      style={{
        position: isDragging ? 'relative' : undefined,
        transform: CSS.Translate.toString(transform ? { ...transform, x: 0 } : null),
        transition,
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
        {(todo.done || completing) && <Check aria-hidden="true" className="todo-check-mark ui-icon" size={12} strokeWidth={2} />}
      </button>
      {editing ? (
        <ImageDocumentEditor
          autoFocus
          busy={busy}
          footer={saveError && <span role="alert">保存失败，请重试</span>}
          initial={document}
          mode="todo-edit"
          onCancel={() => { if (!saving.current) setEditing(false); }}
          onCommit={(next) => { void saveEditing(next); }}
        />
      ) : document.images.length > 0 ? (
        <div
          className={`${textClass} todo-document${maxLines > 0 ? ' todo-text--clamp' : ''}`}
          onDoubleClick={(event) => {
            if (!(event.target instanceof Element) || !event.target.closest('.note-image-preview, .note-image-dialog')) beginEditing();
          }}
          onKeyDown={(event) => {
            if (event.target === event.currentTarget && event.key === 'Enter') beginEditing();
          }}
          style={maxLines > 0 ? { WebkitLineClamp: maxLines } : undefined}
          tabIndex={0}
        >
          {splitImageDocument(document).map(({ text, image }) => (
            <Fragment key={image?.id ?? 'last'}>
              {text}
              {image && <ImagePreview label="待办图片" src={image.src} />}
            </Fragment>
          ))}
        </div>
      ) : (
        <HoverText
          className={textClass}
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
        <GripVertical aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
      </button>
      <button
        aria-label="删除待办"
        className="todo-delete"
        onClick={onDelete}
        title="删除待办"
        type="button"
      >
        <Trash2 aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
      </button>
    </div>
  );
}

function TodoDragPreview({
  todo,
  maxLines,
  widget,
}: {
  todo: PinTodo;
  maxLines: number;
  widget: PinWidget;
}) {
  const textClass = maxLines > 0
    ? 'todo-text todo-text--clamp'
    : 'todo-text todo-text--unlimited';

  return (
    <div
      aria-hidden="true"
      className={`${todo.done ? 'todo-row todo-row--done' : 'todo-row'} todo-row--drag-overlay`}
      style={{
        ...useWidgetColorStyle(widget),
        background: 'var(--widget-accent)',
        borderColor: 'var(--widget-soft)',
        boxShadow: 'inset 3px 0 0 var(--widget-ink)',
      }}
    >
      <span className={todo.done ? 'todo-check todo-check--done' : 'todo-check'}>
        {todo.done && <Check aria-hidden="true" className="todo-check-mark ui-icon" size={12} strokeWidth={2} />}
      </span>
      <span
        className={textClass}
        style={maxLines > 0 ? { WebkitLineClamp: maxLines } : undefined}
      >
        {todo.text.trim() ? todo.text : '图片待办'}
      </span>
      <span className="todo-drag-handle"><GripVertical aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} /></span>
      <span className="todo-delete"><Trash2 aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} /></span>
    </div>
  );
}

export function TodoWidget({ initialWidget, embedded = false }: { initialWidget: PinWidget; embedded?: boolean }) {
  const [widget, setWidget] = useState(initialWidget);
  useWidgetUpdates(setWidget);
  const [todos, setTodos] = useState<PinTodo[]>([]);
  const contextMenu = useContextMenu(!embedded);
  const [composerVersion, setComposerVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(false);
  const [deletedTodo, setDeletedTodo] = useState<PinTodo | null>(null);
  const [completingIds, setCompletingIds] = useState<Set<string>>(() => new Set());
  const viewSettings = useWindowDisplaySettings();
  const [loaded, setLoaded] = useState(false);
  const [activeTodoId, setActiveTodoId] = useState<string | null>(null);
  const creatingTodo = useRef(false);
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

  const addTodo = async (document: PinNote) => {
    if (creatingTodo.current || (!document.text.trim() && document.images.length === 0)) return;
    creatingTodo.current = true;
    setCreating(true);
    setCreateError(false);
    try {
      const created = await window.pinApi.createTodo(document);
      if (created) {
        setTodos((current) => [...current, created]);
        setComposerVersion((version) => version + 1);
      } else {
        setCreateError(true);
      }
    } catch {
      setCreateError(true);
    } finally {
      creatingTodo.current = false;
      setCreating(false);
    }
  };

  const updateTodo = async (todoId: string, patch: PinTodoUpdate) => {
    const updated = await window.pinApi.updateTodo(todoId, patch);
    if (!updated) return false;
    setTodos((current) => current.map((todo) => (todo.id === updated.id ? updated : todo)));
    return true;
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
      void updateTodo(todo.id, { done: false });
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
  const activeTodo = todos.find((todo) => todo.id === activeTodoId) ?? null;
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

  const finishTodoDrag = (group: PinTodo[], event: DragEndEvent) => {
    setActiveTodoId(null);
    reorderTodos(group, event);
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
          <OverlayScrollArea aria-label="待办列表" className="todo-list">
            {!loaded && <p className="app--loading">加载中…</p>}
            {loaded && (
              <DndContext
                autoScroll
                collisionDetection={closestCenter}
                modifiers={TODO_DRAG_MODIFIERS}
                onDragCancel={() => setActiveTodoId(null)}
                onDragEnd={(event) => finishTodoDrag(openTodos, event)}
                onDragStart={(event) => setActiveTodoId(String(event.active.id))}
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
                      onUpdate={(document) => updateTodo(todo.id, document)}
                      todo={todo}
                    />
                  ))}
                </SortableContext>
                <DragOverlay adjustScale={false} dropAnimation={null}>
                  {activeTodo && !activeTodo.done
                    ? <TodoDragPreview maxLines={viewSettings.maxLines} todo={activeTodo} widget={widget} />
                    : null}
                </DragOverlay>
              </DndContext>
            )}
            {loaded && completedTodos.length > 0 && (
              <>
                <div className="todo-completed-heading">已完成 {completedTodos.length}</div>
                <DndContext
                  autoScroll
                  collisionDetection={closestCenter}
                  modifiers={TODO_DRAG_MODIFIERS}
                  onDragCancel={() => setActiveTodoId(null)}
                  onDragEnd={(event) => finishTodoDrag(completedTodos, event)}
                  onDragStart={(event) => setActiveTodoId(String(event.active.id))}
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
                        onUpdate={(document) => updateTodo(todo.id, document)}
                        todo={todo}
                      />
                    ))}
                  </SortableContext>
                  <DragOverlay adjustScale={false} dropAnimation={null}>
                    {activeTodo?.done
                      ? <TodoDragPreview maxLines={viewSettings.maxLines} todo={activeTodo} widget={widget} />
                      : null}
                  </DragOverlay>
                </DndContext>
              </>
            )}
            {deletedTodo && (
              <div className="todo-undo-row">
                <span className="todo-undo-text">已删除「{deletedTodo.text.trim() || '图片待办'}」</span>
                <button className="todo-undo-button" onClick={restoreTodo} type="button">
                  撤销
                </button>
              </div>
            )}
          </OverlayScrollArea>
          <footer className="todo-input-row">
            <span aria-hidden="true" className="todo-input-symbol">[+]</span>
            <ImageDocumentEditor
              autoFocus={composerVersion > 0}
              busy={creating || !loaded}
              footer={createError && <span role="alert">新增失败，请重试</span>}
              initial={EMPTY_TODO}
              key={composerVersion}
              mode="todo-create"
              onCommit={(document) => { void addTodo(document); }}
            />
          </footer>
          {!embedded && viewSettings.opacityBar && <OpacityBar onChange={setOpacity} widget={widget} />}
        </>
      )}
      {!embedded && <OpacityContextMenu menu={contextMenu} onChange={setOpacity} onPin={togglePin} showOpacity={!viewSettings.opacityBar} widget={widget} />}
    </main>
  );
}
