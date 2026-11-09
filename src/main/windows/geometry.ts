import { type WidgetType, type Widget } from '../database/schema';
import { type Display, type Rectangle, screen } from 'electron';

export const MIN_WIDTH = 240;

export const MIN_HEIGHT = 160;

export const COLLAPSED_MIN_WIDTH = 120;

// Leave room below the painted title bar so Windows does not clip its border.
export const COLLAPSED_HEIGHT = 38;

const SNAP_DISTANCE = 12;

export const DEFAULT_BOUNDS: Record<WidgetType, { width: number; height: number }> = {
  note: { width: 320, height: 230 },
  todo: { width: 320, height: 480 },
  clip: { width: 320, height: 220 },
  desk: { width: 320, height: 480 },
};

export function rectanglesMatch(left: Rectangle, right: Rectangle, tolerance = 4) {
  return (
    Math.abs(left.x - right.x) <= tolerance &&
    Math.abs(left.y - right.y) <= tolerance &&
    Math.abs(left.width - right.width) <= tolerance &&
    Math.abs(left.height - right.height) <= tolerance
  );
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function displayForWidget<T extends Pick<Display, 'id'>>(
  displayId: number | null,
  displays: readonly T[],
  fallback: T,
): T {
  return displays.find((display) => display.id === displayId) ?? fallback;
}

export type SavedGeometry = Pick<Widget, 'type' | 'collapsed' | 'collapsedWidth' | 'width' | 'height' | 'x' | 'y'>;

export function fitWidgetBounds(widget: SavedGeometry, workArea: Rectangle): Rectangle {
  const defaults = DEFAULT_BOUNDS[widget.type];
  const expandedWidth = clamp(widget.width || defaults.width, MIN_WIDTH, workArea.width);
  const width = widget.collapsed
    ? clamp(widget.collapsedWidth ?? expandedWidth, COLLAPSED_MIN_WIDTH, workArea.width)
    : expandedWidth;
  const expandedHeight = clamp(widget.height || defaults.height, MIN_HEIGHT, workArea.height);
  const height = widget.collapsed ? COLLAPSED_HEIGHT : expandedHeight;

  return {
    width,
    height,
    x: clamp(widget.x, workArea.x, workArea.x + workArea.width - width),
    y: clamp(widget.y, workArea.y, workArea.y + workArea.height - height),
  };
}

export function normalizeBounds(widget: Widget): Rectangle {
  const fallback = widget.displayId === null ? screen.getDisplayMatching(widget) : screen.getPrimaryDisplay();
  const display = displayForWidget(widget.displayId, screen.getAllDisplays(), fallback);
  return fitWidgetBounds(widget, display.workArea);
}

export function snapBounds(bounds: Rectangle): Rectangle {
  const display = screen.getDisplayMatching(bounds);
  const workArea = display.workArea;
  const right = workArea.x + workArea.width - bounds.width;
  const bottom = workArea.y + workArea.height - bounds.height;
  const x =
    Math.abs(bounds.x - workArea.x) <= SNAP_DISTANCE
      ? workArea.x
      : Math.abs(bounds.x - right) <= SNAP_DISTANCE
        ? right
        : bounds.x;
  const y =
    Math.abs(bounds.y - workArea.y) <= SNAP_DISTANCE
      ? workArea.y
      : Math.abs(bounds.y - bottom) <= SNAP_DISTANCE
        ? bottom
        : bounds.y;

  return { ...bounds, x, y };
}
