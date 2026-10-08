import { type PinWidget } from '../shared/types';

export type WidgetType = PinWidget['type'];

export const WIDGET_OPTIONS: Array<{ type: WidgetType; label: string }> = [
  { type: 'note', label: '新便签' },
  { type: 'todo', label: '新待办清单' },
  { type: 'clip', label: '新剪贴板' },
  { type: 'desk', label: '新三合一' },
];

export const MANAGER_FILTER_OPTIONS: Array<{ type: WidgetType | 'all'; label: string }> = [
  { type: 'all', label: 'ALL' },
  { type: 'note', label: 'NOTE' },
  { type: 'todo', label: 'TODO' },
  { type: 'clip', label: 'CLIP' },
  { type: 'desk', label: 'DESK' },
];

export function widgetDisplayName(widget: PinWidget) {
  return widget.title.trim() || widget.type.toUpperCase();
}
