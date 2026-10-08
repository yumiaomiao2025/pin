import type * as React from 'react';
import { type PinWidget } from '../../shared/types';
import { useEffect } from 'react';

export function useWidgetUpdates(setWidget: React.Dispatch<React.SetStateAction<PinWidget>>) {
  useEffect(() => {
    const unsubscribe = window.pinApi.onWidgetChanged((nextWidget) => {
      setWidget((current) => (current.id === nextWidget.id ? nextWidget : current));
    });
    return unsubscribe;
  }, [setWidget]);
}
