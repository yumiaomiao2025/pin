import { useEffect, useState } from 'react';
import type { ColorPreview } from '../../shared/colors';

export function useColorPreview() {
  const [colorPreview, setColorPreview] = useState<ColorPreview | null>(null);
  useEffect(() => {
    let active = true;
    let receivedEvent = false;
    const unsubscribe = window.pinApi.onColorPreviewChanged((preview) => {
      receivedEvent = true;
      if (active) setColorPreview(preview);
    });
    void window.pinApi.getColorPreview().then((preview) => {
      if (active && !receivedEvent) setColorPreview(preview);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);
  return colorPreview;
}
