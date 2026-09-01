import { useEffect, useRef, useState } from 'react';
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
      className={`${todo.done ? 'todo-row todo-row--done' : 'todo-row'}${dragging ? ' todo-row--dragging' : ''}${dragOver ? ' todo-row--drag-over' : ''}`}
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
        className={todo.done ? 'todo-check todo-check--done' : 'todo-check'}
        onClick={onToggle}
        title={todo.done ? '取消完成' : '标记完成'}
        type="button"
      >
        {todo.done ? '✓' : ''}
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
        <button
          className="todo-text"
          onDoubleClick={beginEditing}
          title="双击编辑"
          type="button"
        >
          {todo.text}
        </button>
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

function TodoWidget({ initialWidget }: { initialWidget: PinWidget }) {
  const [widget, setWidget] = useState(initialWidget);
  const [todos, setTodos] = useState<PinTodo[]>([]);
  const [draft, setDraft] = useState('');
  const [deletedTodo, setDeletedTodo] = useState<PinTodo | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const composing = useRef(false);

  useEffect(() => {
    if (!deletedTodo) {
      return;
    }
    const timer = window.setTimeout(() => setDeletedTodo(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [deletedTodo]);

  useEffect(() => {
    let active = true;
    void window.pinApi.listTodos().then((nextTodos) => {
      if (!active) {
        return;
      }
      setTodos(nextTodos ?? []);
      setLoaded(true);
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
          [...current, restored].sort((left, right) => left.sortOrder - right.sortOrder),
        );
      }
      setDeletedTodo(null);
    });
  };

  const openTodos = todos.filter((todo) => !todo.done);
  const completedTodos = todos.filter((todo) => todo.done);
  const displayedTodos = [...openTodos, ...completedTodos];

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
    <main className="app">
      <TitleBar onCollapse={toggleCollapsed} onHide={hide} onPin={togglePin} widget={widget} />
      {!widget.collapsed && (
        <>
          <div className="todo-list">
            {!loaded && <p className="app--loading">加载中…</p>}
            {loaded && openTodos.map((todo) => (
              <TodoRow
                dragOver={dragOverId === todo.id}
                dragging={dragId === todo.id}
                key={todo.id}
                onDragEnd={clearDrag}
                onDragOver={() => setDragOverId(todo.id)}
                onDragStart={() => setDragId(todo.id)}
                onDrop={() => reorderTodos(todo.id)}
                onDelete={() => deleteTodo(todo.id)}
                onToggle={() => updateTodo(todo.id, { done: !todo.done })}
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
                    key={todo.id}
                    onDragEnd={clearDrag}
                    onDragOver={() => setDragOverId(todo.id)}
                    onDragStart={() => setDragId(todo.id)}
                    onDrop={() => reorderTodos(todo.id)}
                    onDelete={() => deleteTodo(todo.id)}
                    onToggle={() => updateTodo(todo.id, { done: !todo.done })}
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
          <OpacityBar onChange={setOpacity} widget={widget} />
          <ResizeHandle />
        </>
      )}
    </main>
  );
}

function NoteWidget({ initialWidget }: { initialWidget: PinWidget }) {
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
    <main className="app">
      <TitleBar onCollapse={toggleCollapsed} onHide={hide} onPin={togglePin} widget={widget} />
      {!widget.collapsed && (
        <>
          <textarea
            aria-label="便签正文"
            className="note-editor"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="写点什么…"
            value={draft}
          />
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
  return <UnsupportedWidget widget={widget} />;
}

function App() {
  const context = getWindowContext();
  return context.role === 'onboarding' ? <Onboarding /> : <WidgetApp />;
}

const root = document.getElementById('root');

if (!root) {
  throw new Error('Renderer root element is missing');
}

createRoot(root).render(<App />);
