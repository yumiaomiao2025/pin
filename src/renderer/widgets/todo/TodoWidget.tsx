import type * as React from 'react';
import { type Modifier, useSensors, useSensor, PointerSensor, KeyboardSensor, type DragEndEvent, DndContext, closestCenter, DragOverlay } from '@dnd-kit/core';
import { type PinTodo, type PinWidget } from '../../../shared/types';
import { useState, useRef, useEffect } from 'react';
import { useSortable, sortableKeyboardCoordinates, arrayMove, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, GripVertical, Trash2 } from 'lucide-react';
import { OverlayTextarea, OverlayScrollArea } from '../../components/OverlayScrollArea';
import { HoverText } from '../../components/HoverText';
import { useWidgetColorStyle } from '../../colors/widget-colors';
import { useWidgetUpdates } from '../../hooks/use-widget-updates';
import { useContextMenu, OpacityContextMenu } from '../../components/OpacityContextMenu';
import { useWindowDisplaySettings } from '../../hooks/use-window-display-settings';
import { useOpacityControl } from '../../hooks/use-opacity-control';
import { TitleBar, OpacityBar, ResizeHandle } from '../../components/WidgetChrome';

const TODO_DRAG_MODIFIERS: Modifier[] = [
  ({ transform }) => ({ ...transform, x: 0 }),
];

const TODO_SORT_TRANSITION = {
  duration: 120,
  easing: 'linear',
};

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
  } = useSortable({
    id: todo.id,
    disabled: editing || completing,
    animateLayoutChanges: () => false,
    transition: TODO_SORT_TRANSITION,
  });

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
        <OverlayTextarea
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
        {todo.text}
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
  const [draft, setDraft] = useState('');
  const [deletedTodo, setDeletedTodo] = useState<PinTodo | null>(null);
  const [completingIds, setCompletingIds] = useState<Set<string>>(() => new Set());
  const viewSettings = useWindowDisplaySettings();
  const [loaded, setLoaded] = useState(false);
  const [activeTodoId, setActiveTodoId] = useState<string | null>(null);
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
                      onUpdate={(text) => updateTodo(todo.id, { text })}
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
                        onUpdate={(text) => updateTodo(todo.id, { text })}
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
                <span className="todo-undo-text">已删除「{deletedTodo.text}」</span>
                <button className="todo-undo-button" onClick={restoreTodo} type="button">
                  撤销
                </button>
              </div>
            )}
          </OverlayScrollArea>
          <footer className="todo-input-row">
            <span aria-hidden="true" className="todo-input-symbol">[+]</span>
            <OverlayTextarea
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
