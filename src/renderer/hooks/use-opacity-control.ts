import type * as React from 'react';
import { type PinWidget } from '../../shared/types';
import { useRef, useCallback, useEffect } from 'react';

export function useOpacityControl(setWidget: React.Dispatch<React.SetStateAction<PinWidget>>) {
  const pendingOpacity = useRef<number | undefined>(undefined);
  const persistTimer = useRef<number | undefined>(undefined);
  const setWidgetRef = useRef(setWidget);
  setWidgetRef.current = setWidget;

  const flush = useCallback(() => {
    persistTimer.current = undefined;
    const opacity = pendingOpacity.current;
    pendingOpacity.current = undefined;
    if (opacity !== undefined) {
      void window.pinApi.setOpacity(opacity);
    }
  }, []);

  useEffect(() => () => {
    if (persistTimer.current !== undefined) {
      window.clearTimeout(persistTimer.current);
    }
    flush();
  }, [flush]);

  return useCallback((value: number) => {
    const opacity = Math.min(100, Math.max(5, Math.round(value)));
    setWidgetRef.current((current) => ({ ...current, opacity }));
    pendingOpacity.current = opacity;
    if (persistTimer.current === undefined) {
      persistTimer.current = window.setTimeout(flush, 32);
    }
  }, [flush]);
}
