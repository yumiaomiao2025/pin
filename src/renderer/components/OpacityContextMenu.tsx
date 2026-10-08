import type * as React from 'react';
import { useState, useRef, useEffect } from 'react';
import { type PinWidget } from '../../shared/types';
import { RangeControl } from './RangeControl';

interface ContextMenuState {
  position: { left: number; top: number } | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  handleContextMenu: (event: React.MouseEvent<HTMLElement>) => void;
  close: () => void;
}

export function useContextMenu(enabled: boolean): ContextMenuState {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) {
      return undefined;
    }
    const close = (event: MouseEvent) => {
      if (event.button !== 0 || (event.target instanceof Node && menuRef.current?.contains(event.target))) {
        return;
      }
      setPosition(null);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [position]);

  const handleContextMenu = (event: React.MouseEvent<HTMLElement>) => {
    if (!enabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setPosition({
      left: Math.min(event.clientX, Math.max(8, window.innerWidth - 204)),
      top: Math.min(event.clientY, Math.max(8, window.innerHeight - 292)),
    });
  };

  return { position, menuRef, handleContextMenu, close: () => setPosition(null) };
}

export function OpacityContextMenu({
  menu,
  onPin,
  onChange,
  widget,
  showOpacity,
}: {
  menu: ContextMenuState;
  onPin: () => void;
  onChange: (value: number) => void;
  widget: PinWidget;
  showOpacity: boolean;
}) {
  if (!menu.position) {
    return null;
  }
  return (
    <div
      className="window-context-menu"
      onContextMenu={(event) => event.stopPropagation()}
      ref={menu.menuRef}
      style={menu.position}
    >
      {showOpacity && (
        <div className="window-context-menu-opacity">
          <label htmlFor="context-opacity">透明度</label>
          <RangeControl
            aria-label="窗口透明度"
            id="context-opacity"
            maximum={100}
            minimum={5}
            onChange={onChange}
            value={widget.opacity}
          />
          <output>{widget.opacity}%</output>
        </div>
      )}
      <button
        className="window-context-menu-item"
        onClick={() => {
          menu.close();
          void window.pinApi.createSameWidget();
        }}
        type="button"
      >
        再开一个同类
      </button>
      <button
        className="window-context-menu-item"
        onClick={() => {
          menu.close();
          onPin();
        }}
        type="button"
      >
        {widget.pin ? '取消置顶' : '置顶显示'}
      </button>
      <button
        className="window-context-menu-item"
        onClick={() => {
          menu.close();
          void window.pinApi.openWidgetColors();
        }}
        type="button"
      >
        颜色…
      </button>
      <button
        className="window-context-menu-item"
        onClick={() => {
          menu.close();
          void window.pinApi.openManagerRename();
        }}
        type="button"
      >
        重命名…
      </button>
      <button
        className="window-context-menu-item"
        onClick={() => {
          menu.close();
          void window.pinApi.hideWindow();
        }}
        type="button"
      >
        隐藏（保留内容）
      </button>
      <button
        className="window-context-menu-item window-context-menu-item--delete"
        onClick={() => {
          if (!window.confirm(`删除窗口“${widget.title.trim() || widget.type.toUpperCase()}”？`)) {
            return;
          }
          menu.close();
          void window.pinApi.deleteCurrentWidget();
        }}
        type="button"
      >
        删除
      </button>
    </div>
  );
}
