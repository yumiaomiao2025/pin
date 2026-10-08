import type * as React from 'react';
import { useRef } from 'react';

export function useWindowDrag() {
  const dragRef = useRef<{
    pointerId: number;
    startScreenX: number;
    startScreenY: number;
    currentScreenX: number;
    currentScreenY: number;
    originX: number;
    originY: number;
    ready: boolean;
    frame: number | null;
  } | null>(null);

  const flushDrag = () => {
    const drag = dragRef.current;
    if (!drag || !drag.ready) {
      return;
    }
    drag.frame = null;
    void window.pinApi.setPosition(
      drag.originX + drag.currentScreenX - drag.startScreenX,
      drag.originY + drag.currentScreenY - drag.startScreenY,
    );
  };

  const scheduleDrag = () => {
    const drag = dragRef.current;
    if (!drag || !drag.ready || drag.frame !== null) {
      return;
    }
    drag.frame = requestAnimationFrame(flushDrag);
  };

  const finishDrag = (event: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    if (drag.frame !== null) {
      cancelAnimationFrame(drag.frame);
      drag.frame = null;
    }
    if (drag.ready) {
      void window.pinApi.setPosition(
        drag.originX + drag.currentScreenX - drag.startScreenX,
        drag.originY + drag.currentScreenY - drag.startScreenY,
      );
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  return {
    onPointerCancel: finishDrag,
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (
        event.button !== 0 ||
        (event.target instanceof Element && event.target.closest('button'))
      ) {
        return;
      }
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      const drag = {
        pointerId: event.pointerId,
        startScreenX: event.screenX,
        startScreenY: event.screenY,
        currentScreenX: event.screenX,
        currentScreenY: event.screenY,
        originX: 0,
        originY: 0,
        ready: false,
        frame: null as number | null,
      };
      dragRef.current = drag;
      void window.pinApi.getWindowBounds().then((bounds) => {
        if (dragRef.current !== drag) {
          return;
        }
        if (!bounds) {
          dragRef.current = null;
          return;
        }
        drag.originX = bounds.x;
        drag.originY = bounds.y;
        drag.ready = true;
        scheduleDrag();
      });
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }
      event.preventDefault();
      drag.currentScreenX = event.screenX;
      drag.currentScreenY = event.screenY;
      scheduleDrag();
    },
    onPointerUp: finishDrag,
  };
}
