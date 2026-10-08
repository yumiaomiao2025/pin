import type * as React from 'react';
import { type PinWidget } from '../../shared/types';
import { useWindowDrag } from '../hooks/use-window-drag';
import { PanelTopOpen, PanelTopClose, X } from 'lucide-react';
import { RangeControl } from './RangeControl';
import { useRef } from 'react';

export function TitleBar({ widget, onHide, onPin, onCollapse }: {
  widget: PinWidget;
  onHide: () => void;
  onPin: () => void;
  onCollapse: () => void;
}) {
  const drag = useWindowDrag();

  return (
    <header
      className="titlebar"
      {...drag}
      onDoubleClick={onCollapse}
    >
      <span className="type-label">{widget.type.toUpperCase()}</span>
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

export function ResizeHandle() {
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
