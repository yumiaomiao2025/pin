import { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';

export function HoverText({
  text,
  className,
  maxLines,
  hoverFull,
  onDoubleClick,
  completing,
}: {
  text: string;
  className: string;
  maxLines: number;
  hoverFull: boolean;
  onDoubleClick: () => void;
  completing: boolean;
}) {
  const textRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<number | undefined>(undefined);
  const [tooltip, setTooltip] = useState<{
    left: number;
    top: number;
    width: number;
    sourceTop: number;
    sourceBottom: number;
  } | null>(null);

  const hideTooltip = () => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    setTooltip(null);
  };

  const showTooltip = () => {
    if (!hoverFull || !textRef.current) {
      return;
    }
    const element = textRef.current;
    if (element.scrollHeight - element.clientHeight < 2 && element.scrollWidth - element.clientWidth < 2) {
      return;
    }
    timerRef.current = window.setTimeout(() => {
      const rect = element.getBoundingClientRect();
      setTooltip({
        left: rect.left,
        top: rect.bottom + 6,
        width: Math.max(220, rect.width),
        sourceTop: rect.top,
        sourceBottom: rect.bottom,
      });
      timerRef.current = undefined;
    }, 400);
  };

  useEffect(() => () => hideTooltip(), []);

  useLayoutEffect(() => {
    if (!tooltip || !tooltipRef.current) {
      return;
    }
    const tipRect = tooltipRef.current.getBoundingClientRect();
    const padding = 8;
    const left = Math.min(
      Math.max(padding, tooltip.left),
      Math.max(padding, window.innerWidth - tipRect.width - padding),
    );
    let top = tooltip.sourceBottom + 6;
    if (top + tipRect.height + padding > window.innerHeight) {
      top = tooltip.sourceTop - tipRect.height - 6;
    }
    top = Math.min(
      Math.max(padding, top),
      Math.max(padding, window.innerHeight - tipRect.height - padding),
    );
    if (left !== tooltip.left || top !== tooltip.top) {
      setTooltip((current) => (current ? { ...current, left, top } : current));
    }
  }, [tooltip]);

  const textClass = maxLines > 0 ? `${className} todo-text--clamp` : `${className} todo-text--unlimited`;

  return (
    <>
      <button
        className={textClass}
        onDoubleClick={(event) => {
          event.stopPropagation();
          onDoubleClick();
        }}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        ref={textRef}
        style={maxLines > 0 ? { WebkitLineClamp: maxLines } : undefined}
        type="button"
      >
        {text}
        {completing && <span aria-hidden="true" className="todo-text-strike" />}
      </button>
      {tooltip && createPortal(
        <div
          className="overflow-tooltip"
          ref={tooltipRef}
          style={{ left: tooltip.left, top: tooltip.top, width: tooltip.width }}
        >
          {text}
        </div>,
        document.body,
      )}
    </>
  );
}
