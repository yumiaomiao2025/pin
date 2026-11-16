import { type PinWidget } from '../../../shared/types';
import { useState } from 'react';
import { useWidgetUpdates } from '../../hooks/use-widget-updates';
import { useContextMenu, OpacityContextMenu } from '../../components/OpacityContextMenu';
import { useWindowDisplaySettings } from '../../hooks/use-window-display-settings';
import { useOpacityControl } from '../../hooks/use-opacity-control';
import { useWidgetColorStyle } from '../../colors/widget-colors';
import { TitleBar, OpacityBar } from '../../components/WidgetChrome';
import { NoteEditor } from './NoteEditor';

export function NoteWidget({ initialWidget, embedded = false }: { initialWidget: PinWidget; embedded?: boolean }) {
  const [widget, setWidget] = useState(initialWidget);
  useWidgetUpdates(setWidget);
  const contextMenu = useContextMenu(!embedded);
  const viewSettings = useWindowDisplaySettings();

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

  return (
    <main
      className={embedded ? 'desk-panel widget-themed' : 'app widget-themed'}
      onContextMenu={!embedded ? contextMenu.handleContextMenu : undefined}
      style={useWidgetColorStyle(widget)}
    >
      {!embedded && <TitleBar onCollapse={toggleCollapsed} onHide={hide} onPin={togglePin} widget={widget} />}
      {!widget.collapsed && (
        <>
          <NoteEditor />
          {!embedded && viewSettings.opacityBar && <OpacityBar onChange={setOpacity} widget={widget} />}
        </>
      )}
      {!embedded && <OpacityContextMenu menu={contextMenu} onChange={setOpacity} onPin={togglePin} showOpacity={!viewSettings.opacityBar} widget={widget} />}
    </main>
  );
}
