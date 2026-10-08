import { type Settings, type Widget, type CustomKit } from '../database/schema';
import { type ColorSet } from '../../shared/colors';

export function settingsToColors(settings: Settings): ColorSet {
  return {
    paper: settings.defaultPaperColor,
    ink: settings.defaultInkColor,
    title: settings.defaultTitleColor,
    accent: settings.defaultAccentColor,
    spine: settings.defaultSpineColor,
    shadow: settings.defaultShadowColor,
  };
}

export function colorsToSettings(colors: ColorSet) {
  return {
    defaultPaperColor: colors.paper,
    defaultInkColor: colors.ink,
    defaultTitleColor: colors.title,
    defaultAccentColor: colors.accent,
    defaultSpineColor: colors.spine,
    defaultShadowColor: colors.shadow,
  };
}

export function colorsToWidgetPatch(colors: ColorSet) {
  return {
    paperColor: colors.paper,
    inkColor: colors.ink,
    titleColor: colors.title,
    accentColor: colors.accent,
    spineColor: colors.spine,
    shadowColor: colors.shadow,
  };
}

export function widgetToColors(widget: Widget): ColorSet {
  return {
    paper: widget.paperColor,
    ink: widget.inkColor,
    title: widget.titleColor,
    accent: widget.accentColor,
    spine: widget.spineColor,
    shadow: widget.shadowColor,
  };
}

export function kitToColors(kit: CustomKit): ColorSet {
  return {
    paper: kit.paper,
    ink: kit.ink,
    title: kit.title,
    accent: kit.accent,
    spine: kit.spine,
    shadow: kit.shadow,
  };
}

export function colorsEqual(left: ColorSet, right: ColorSet) {
  return (
    left.paper === right.paper &&
    left.ink === right.ink &&
    left.title === right.title &&
    left.accent === right.accent &&
    left.spine === right.spine &&
    left.shadow === right.shadow
  );
}
