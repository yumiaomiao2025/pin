import type { ColorSet } from './colors';

export interface PinPingResult {
  ok: boolean;
  version: string;
}

export interface PinWidget {
  colorKitId: string | null;
  id: string;
  type: 'note' | 'todo' | 'clip' | 'desk';
  title: string;
  noteText: string;
  opacity: number;
  pin: boolean;
  hidden: boolean;
  collapsed: boolean;
  collapsedWidth: number | null;
  width: number;
  height: number;
  activeTab: 'note' | 'todo' | 'clip';
  paperColor: string;
  inkColor: string;
  titleColor: string | null;
  accentColor: string;
  spineColor: string | null;
  shadowColor: string;
  followsDefault: boolean;
}

export interface PinTodo {
  id: string;
  widgetId: string;
  text: string;
  done: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  images?: PinNoteImage[];
}

export const MAX_NOTE_IMAGES = 12;
export const MAX_NOTE_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_CLIP_ITEMS = 20;
export const CLIP_FRAGMENT_ATTRIBUTE = 'data-pin-clip';

export interface PinNoteImage {
  id: string;
  offset: number;
  src?: string;
}

export interface PinNote {
  text: string;
  images: PinNoteImage[];
}

export interface PinTodoUpdate {
  text?: string;
  images?: PinNoteImage[];
  done?: boolean;
}

export interface PinClipItem {
  id: string;
  widgetId: string;
  text: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
  images: PinNoteImage[];
}

export interface PinSettings {
  defaultColorKitId: string | null;
  defaultPaperColor: string;
  defaultInkColor: string;
  defaultTitleColor: string | null;
  defaultAccentColor: string;
  defaultSpineColor: string | null;
  defaultShadowColor: string;
  fontSize: number;
  maxLines: number;
  hoverFull: boolean;
  opacityBar: boolean;
  defaultOpacity: number;
  pinAll: boolean;
  autostart: boolean;
  snap: boolean;
}

export interface PinColorContext {
  scope: 'default' | 'widget';
  colors: ColorSet;
  activePresetId: string | null;
  activeKitId: string | null;
  appliedWindowCount: number;
  followsDefault?: boolean;
  widgetTitle?: string;
}

export type PinColorSet = ColorSet;

export interface PinCustomKit {
  id: string;
  name: string;
  paper: string;
  ink: string;
  title: string | null;
  accent: string;
  spine: string | null;
  shadow: string;
  createdAt: number;
  updatedAt: number;
}

export type PinSettingsUpdate = Partial<Pick<
  PinSettings,
  'fontSize' | 'maxLines' | 'hoverFull' | 'opacityBar' | 'defaultOpacity' | 'pinAll' | 'autostart' | 'snap'
>>;
