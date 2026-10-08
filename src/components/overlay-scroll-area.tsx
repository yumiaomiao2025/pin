import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent, ReactNode, RefObject, TextareaHTMLAttributes } from 'react';

type ScrollGeometry = { height: number; top: number; overflow: number; travel: number };

function OverlayScrollbar({
  viewportRef,
  contentRef,
}: {
  viewportRef: RefObject<HTMLElement | null>;
  contentRef?: RefObject<HTMLElement | null>;
}) {
  const [geometry, setGeometry] = useState<ScrollGeometry>({ height: 0, top: 0, overflow: 0, travel: 0 });
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ pointerId: number; y: number; scrollTop: number } | null>(null);

  const sync = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const trackHeight = viewport.clientHeight;
    const overflow = Math.max(0, viewport.scrollHeight - trackHeight);
    // Even a very short editor must keep its thumb inside the viewport.
    const height = Math.min(trackHeight, Math.max(46, trackHeight * trackHeight / Math.max(1, viewport.scrollHeight)));
    const travel = Math.max(0, trackHeight - height);
    const top = overflow ? travel * Math.max(0, Math.min(overflow, viewport.scrollTop)) / overflow : 0;
    setGeometry((previous) => (
      previous.height === height && previous.top === top && previous.overflow === overflow && previous.travel === travel
        ? previous : { height, top, overflow, travel }
    ));
  }, [viewportRef]);

  // Controlled textarea values can change without a native input event.
  useLayoutEffect(sync);
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(sync);
    observer.observe(viewport);
    if (contentRef?.current) observer.observe(contentRef.current);
    viewport.addEventListener('scroll', sync, { passive: true });
    viewport.addEventListener('input', sync);
    document.fonts.addEventListener('loadingdone', sync);
    return () => {
      observer.disconnect();
      viewport.removeEventListener('scroll', sync);
      viewport.removeEventListener('input', sync);
      document.fonts.removeEventListener('loadingdone', sync);
    };
  }, [sync, viewportRef, contentRef]);

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div
      aria-hidden="true"
      className={`overlay-scrollbar${dragging ? ' overlay-scrollbar--dragging' : ''}`}
      hidden={geometry.overflow <= 0}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => {
        const viewport = viewportRef.current;
        if (!viewport) return;
        const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
        viewport.scrollTop += event.deltaY * unit;
        event.stopPropagation();
      }}
    >
      <div
        className="overlay-scrollbar-thumb"
        onLostPointerCapture={finishDrag}
        onPointerCancel={finishDrag}
        onPointerDown={(event) => {
          if (event.button !== 0 || !viewportRef.current) return;
          event.preventDefault();
          event.stopPropagation();
          dragRef.current = { pointerId: event.pointerId, y: event.clientY, scrollTop: viewportRef.current.scrollTop };
          setDragging(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (!drag || drag.pointerId !== event.pointerId || !viewportRef.current || geometry.travel <= 0) return;
          viewportRef.current.scrollTop = drag.scrollTop + (event.clientY - drag.y) * geometry.overflow / geometry.travel;
        }}
        onPointerUp={finishDrag}
        style={{ height: geometry.height, transform: `translateY(${geometry.top}px)` }}
      />
    </div>
  );
}

export function OverlayScrollArea({ children, className, 'aria-label': label }: {
  children: ReactNode;
  className: string;
  'aria-label'?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <div className={`overlay-scroll-area ${className}`}>
      <div aria-label={label} className="overlay-scroll-viewport" ref={viewportRef} role={label ? 'region' : undefined} tabIndex={0}>
        <div className="overlay-scroll-content" ref={contentRef}>{children}</div>
      </div>
      <OverlayScrollbar contentRef={contentRef} viewportRef={viewportRef} />
    </div>
  );
}

export function OverlayTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const viewportRef = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="overlay-textarea-area">
      <textarea {...props} className={`overlay-scroll-viewport ${props.className ?? ''}`} ref={viewportRef} />
      <OverlayScrollbar viewportRef={viewportRef} />
    </div>
  );
}
