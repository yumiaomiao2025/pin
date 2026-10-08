import type * as React from 'react';
import { createContext, useContext } from 'react';
import { type ColorPreview, deriveColorVars } from '../../shared/colors';
import { type PinSettings, type PinColorSet, type PinWidget } from '../../shared/types';

export const ColorPreviewContext = createContext<ColorPreview | null>(null);

export function settingsToColorSet(settings: PinSettings): PinColorSet {
  return {
    paper: settings.defaultPaperColor,
    ink: settings.defaultInkColor,
    title: settings.defaultTitleColor,
    accent: settings.defaultAccentColor,
    spine: settings.defaultSpineColor,
    shadow: settings.defaultShadowColor,
  };
}

export function colorSetStyle(colorSet: PinColorSet): React.CSSProperties {
  const colors = deriveColorVars(colorSet);
  return {
    '--widget-paper': colors.paper,
    '--widget-ink': colors.ink,
    '--widget-title': colors.title,
    '--widget-accent': colors.accent,
    '--widget-spine': colors.spine ?? 'transparent',
    '--widget-shadow': colors.shadow,
    '--widget-sub': colors.sub,
    '--widget-soft': colors.soft,
  } as React.CSSProperties;
}

export function useWidgetColorStyle(widget: PinWidget): React.CSSProperties {
  const preview = useContext(ColorPreviewContext);
  const matchesPreview = preview?.scope === 'default'
    ? widget.followsDefault
    : preview?.scope === 'widget' && preview.widgetId === widget.id;
  const colors: PinColorSet = matchesPreview && preview ? preview.colors : {
    paper: widget.paperColor,
    ink: widget.inkColor,
    title: widget.titleColor,
    accent: widget.accentColor,
    spine: widget.spineColor,
    shadow: widget.shadowColor,
  };
  return {
    ...colorSetStyle(colors),
    boxShadow: colors.spine
      ? `inset 8px 0 0 ${colors.spine}, 8px 8px 0 ${colors.shadow}`
      : `8px 8px 0 ${colors.shadow}`,
  } as React.CSSProperties;
}
