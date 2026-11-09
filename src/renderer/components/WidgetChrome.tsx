import type * as React from 'react';
import { type PinWidget } from '../../shared/types';
import { useWindowDrag } from '../hooks/use-window-drag';
import { PanelTopOpen, PanelTopClose, X } from 'lucide-react';
import { RangeControl } from './RangeControl';
import { useRef, useState } from 'react';

export function TitleBar({ widget, onHide, onPin, onCollapse }: {
  widget: PinWidget;
  onHide: () => void;
  onPin: () => void;
  onCollapse: () => void;
}) {
  const drag = useWindowDrag();
  const title = widget.title || widget.type.toUpperCase();
  const [draft, setDraft] = useState<string | null>(null);
  const editing = useRef(false);

  const startRename = () => {
    if (editing.current) return;
    editing.current = true;
    setDraft(title);
  };

  const finishRename = (save: boolean, value: string) => {
    if (!editing.current) return;
    editing.current = false;
    setDraft(null);
    const next = value.trim();
    if (save && next && next !== title) void window.pinApi.renameCurrentWidget(next);
  };

  return (
    <>
      <header
        className={widget.collapsed ? 'titlebar titlebar--collapsed' : 'titlebar'}
        {...drag}
        onDoubleClick={startRename}
      >
        {draft === null ? (
          <span className="type-label" title={`${title} · 双击重命名`}>{title}</span>
        ) : (
          <input
            aria-label="窗口名称"
            autoFocus
            className="type-label title-input"
            onBlur={(event) => finishRename(true, event.currentTarget.value)}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === 'Enter' || event.key === 'Escape') {
                event.preventDefault();
                finishRename(event.key === 'Enter', event.currentTarget.value);
              }
            }}
            value={draft}
          />
        )}
        <button
          aria-pressed={widget.pin}
          className={widget.pin ? 'title-action title-action--pin title-action--active' : 'title-action title-action--pin'}
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
          {widget.collapsed ? (
            <PanelTopOpen aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
          ) : (
            <PanelTopClose aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
          )}
        </button>
        <button
          aria-label="隐藏窗口"
          className="title-action title-action--icon"
          onClick={onHide}
          onDoubleClick={(event) => event.stopPropagation()}
          title="隐藏窗口"
          type="button"
        >
          <X aria-hidden="true" className="ui-icon" size={14} strokeWidth={2} />
        </button>
      </header>
      <ResizeHandle horizontalOnly={widget.collapsed} />
    </>
  );
}

export function OpacityBar({ widget, onChange }: { widget: PinWidget; onChange: (value: number) => void }) {
  return (
    <footer className="opacity-bar">
      <label htmlFor="opacity">OPACITY</label>
      <RangeControl
        aria-label="窗口透明度"
        id="opacity"
        maximum={100}
        minimum={5}
        onChange={onChange}
        value={widget.opacity}
      />
      <output>{widget.opacity}%</output>
    </footer>
  );
}

function ResizeHandle({ horizontalOnly }: { horizontalOnly: boolean }) {
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
      horizontalOnly ? state.startHeight : state.startHeight + event.screenY - state.startScreenY,
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
      aria-label={horizontalOnly ? '调整窗口宽度' : '调整窗口大小'}
      className={horizontalOnly ? 'resize-handle resize-handle--horizontal' : 'resize-handle'}
      onPointerCancel={stopResizing}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopResizing}
      role="separator"
    />
  );
}
