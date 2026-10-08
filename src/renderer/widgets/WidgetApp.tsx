import { type PinWidget } from '../../shared/types';
import { useState, useEffect } from 'react';
import { useWidgetColorStyle } from '../colors/widget-colors';
import { TitleBar, ResizeHandle } from '../components/WidgetChrome';
import { NoteWidget } from './note/NoteWidget';
import { TodoWidget } from './todo/TodoWidget';
import { ClipWidget } from './clip/ClipWidget';
import { DeskWidget } from './desk/DeskWidget';

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
    <main className="app widget-themed" style={useWidgetColorStyle(currentWidget)}>
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

export function WidgetApp() {
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
