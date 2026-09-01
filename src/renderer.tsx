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
