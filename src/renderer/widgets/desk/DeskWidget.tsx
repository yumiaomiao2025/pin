import { type PinWidget } from '../../../shared/types';
import { useState, useEffect } from 'react';
import { useWidgetUpdates } from '../../hooks/use-widget-updates';
import { useContextMenu, OpacityContextMenu } from '../../components/OpacityContextMenu';
import { useWindowDisplaySettings } from '../../hooks/use-window-display-settings';
import { useOpacityControl } from '../../hooks/use-opacity-control';
import { useWidgetColorStyle } from '../../colors/widget-colors';
import { TitleBar, OpacityBar, ResizeHandle } from '../../components/WidgetChrome';
import { NoteWidget } from '../note/NoteWidget';
import { TodoWidget } from '../todo/TodoWidget';
import { ClipWidget } from '../clip/ClipWidget';

const DESK_TAB_OPTIONS: Array<{ id: PinWidget['activeTab']; label: string }> = [
  { id: 'note', label: 'NOTE' },
  { id: 'todo', label: 'TODO' },
  { id: 'clip', label: 'CLIP' },
];

export function DeskWidget({ initialWidget }: { initialWidget: PinWidget }) {
  const [widget, setWidget] = useState(initialWidget);
  useWidgetUpdates(setWidget);
  const contextMenu = useContextMenu(true);
  const viewSettings = useWindowDisplaySettings();

  useEffect(() => {
    let active = true;
    void window.pinApi.getWidget().then((nextWidget) => {
      if (active && nextWidget) {
        setWidget(nextWidget);
      }
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

  const setOpacity = useOpacityControl(setWidget);

  const selectTab = (activeTab: PinWidget['activeTab']) => {
    if (activeTab === widget.activeTab) {
      return;
    }
    void window.pinApi.setActiveTab(activeTab).then((updated) => {
      if (updated) {
        setWidget(updated);
      }
    });
  };

  return (
    <main className="app widget-themed" onContextMenu={contextMenu.handleContextMenu} style={useWidgetColorStyle(widget)}>
      <TitleBar onCollapse={toggleCollapsed} onHide={hide} onPin={togglePin} widget={widget} />
      {!widget.collapsed && (
        <>
          <nav aria-label="DESK 标签页" className="desk-tabs">
            {DESK_TAB_OPTIONS.map((tab) => (
              <button
                aria-selected={widget.activeTab === tab.id}
                className={widget.activeTab === tab.id ? 'desk-tab desk-tab--active' : 'desk-tab'}
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </nav>
          <section className="desk-content">
            {widget.activeTab === 'note' && <NoteWidget embedded initialWidget={widget} />}
            {widget.activeTab === 'todo' && <TodoWidget embedded initialWidget={widget} />}
            {widget.activeTab === 'clip' && <ClipWidget embedded initialWidget={widget} />}
          </section>
          {viewSettings.opacityBar && <OpacityBar onChange={setOpacity} widget={widget} />}
          <ResizeHandle />
        </>
      )}
      <OpacityContextMenu menu={contextMenu} onChange={setOpacity} onPin={togglePin} showOpacity={!viewSettings.opacityBar} widget={widget} />
    </main>
  );
}
