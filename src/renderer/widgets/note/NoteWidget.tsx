import { type PinWidget } from '../../../shared/types';
import { useState, useRef, useEffect } from 'react';
import { useWidgetUpdates } from '../../hooks/use-widget-updates';
import { useContextMenu, OpacityContextMenu } from '../../components/OpacityContextMenu';
import { useWindowDisplaySettings } from '../../hooks/use-window-display-settings';
import { useOpacityControl } from '../../hooks/use-opacity-control';
import { useWidgetColorStyle } from '../../colors/widget-colors';
import { TitleBar, OpacityBar, ResizeHandle } from '../../components/WidgetChrome';
import { OverlayTextarea } from '../../../components/overlay-scroll-area';

export function NoteWidget({ initialWidget, embedded = false }: { initialWidget: PinWidget; embedded?: boolean }) {
  const [widget, setWidget] = useState(initialWidget);
  useWidgetUpdates(setWidget);
  const contextMenu = useContextMenu(!embedded);
  const viewSettings = useWindowDisplaySettings();
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
          <OverlayTextarea
            aria-label="便签正文"
            className="note-editor"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="写点什么…"
            value={draft}
          />
          {!embedded && viewSettings.opacityBar && <OpacityBar onChange={setOpacity} widget={widget} />}
          {!embedded && <ResizeHandle />}
        </>
      )}
      {!embedded && <OpacityContextMenu menu={contextMenu} onChange={setOpacity} onPin={togglePin} showOpacity={!viewSettings.opacityBar} widget={widget} />}
    </main>
  );
}
