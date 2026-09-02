interface PinPingResult {
  ok: boolean;
  version: string;
}

interface PinWidget {
  id: string;
  type: 'note' | 'todo' | 'clip' | 'desk';
  title: string;
  noteText: string;
  opacity: number;
  pin: boolean;
  hidden: boolean;
  collapsed: boolean;
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

interface PinTodo {
  id: string;
  widgetId: string;
  text: string;
  done: boolean;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

interface PinClipItem {
  id: string;
  widgetId: string;
  text: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

interface PinSettings {
  theme: 'light' | 'dark';
  autoTheme: boolean;
  defaultPaperColor: string;
  defaultInkColor: string;
  defaultTitleColor: string | null;
  defaultAccentColor: string;
  defaultSpineColor: string | null;
  defaultShadowColor: string;
  maxLines: number;
  hoverFull: boolean;
  scrollbar: 'always' | 'overlay' | 'hidden';
  opacityBar: boolean;
  defaultOpacity: number;
  pinAll: boolean;
  autostart: boolean;
  snap: boolean;
}

interface PinColorContext {
  scope: 'default';
  colors: {
    paper: string;
    ink: string;
    title: string | null;
    accent: string;
    spine: string | null;
    shadow: string;
  };
  activePresetId: string | null;
}

type PinSettingsUpdate = Partial<Pick<
  PinSettings,
  'theme' | 'autoTheme' | 'maxLines' | 'hoverFull' | 'scrollbar' | 'opacityBar' | 'defaultOpacity' | 'pinAll' | 'autostart' | 'snap'
>>;

interface Window {
  pinApi: {
    ping: () => Promise<PinPingResult>;
    getSettings: () => Promise<PinSettings>;
    updateSettings: (patch: PinSettingsUpdate) => Promise<PinSettings | null>;
    resetSettings: () => Promise<PinSettings | null>;
    openDefaultColors: () => Promise<boolean>;
    getColorContext: () => Promise<PinColorContext | null>;
    applyColorPreset: (presetId: string) => Promise<PinSettings | null>;
    hideColors: () => Promise<boolean>;
    onSettingsChanged: (listener: (settings: PinSettings) => void) => () => void;
    onWidgetChanged: (listener: (widget: PinWidget) => void) => () => void;
    getWidget: () => Promise<PinWidget | null>;
    openManager: () => Promise<boolean>;
    hideManager: () => Promise<boolean>;
    openSettings: () => Promise<boolean>;
    hideSettings: () => Promise<boolean>;
    listManagedWidgets: () => Promise<PinWidget[] | null>;
    setManagedWidgetHidden: (id: string, hidden: boolean) => Promise<PinWidget | null>;
    setManagedWidgetPin: (id: string, pin: boolean) => Promise<PinWidget | null>;
    setAllManagedWidgetsHidden: (hidden: boolean) => Promise<PinWidget[] | null>;
    createManagedWidget: (type: PinWidget['type']) => Promise<PinWidget | null>;
    renameManagedWidget: (id: string, title: string) => Promise<PinWidget | null>;
    deleteManagedWidget: (id: string) => Promise<PinWidget | null>;
    restoreManagedWidget: () => Promise<PinWidget | null>;
    setActiveTab: (activeTab: PinWidget['activeTab']) => Promise<PinWidget | null>;
    listTodos: () => Promise<PinTodo[] | null>;
    createTodo: (text: string) => Promise<PinTodo | null>;
    updateTodo: (id: string, patch: { text?: string; done?: boolean }) => Promise<PinTodo | null>;
    deleteTodo: (id: string) => Promise<PinTodo | null>;
    restoreTodo: () => Promise<PinTodo | null>;
    reorderTodos: (orderedIds: string[]) => Promise<PinTodo[] | null>;
    listClips: () => Promise<PinClipItem[] | null>;
    createClip: (text: string) => Promise<PinClipItem | null>;
    updateClip: (id: string, text: string) => Promise<PinClipItem | null>;
    deleteClip: (id: string) => Promise<PinClipItem | null>;
    restoreClip: () => Promise<PinClipItem | null>;
    reorderClips: (orderedIds: string[]) => Promise<PinClipItem[] | null>;
    copyClip: (id: string) => Promise<PinClipItem | null>;
    saveNote: (noteText: string) => Promise<PinWidget | null>;
    hideWindow: () => Promise<boolean>;
    setSize: (width: number, height: number) => Promise<PinWidget | null>;
    setOpacity: (opacity: number) => Promise<PinWidget | null>;
    setPin: (pin: boolean) => Promise<PinWidget | null>;
    setCollapsed: (collapsed: boolean) => Promise<PinWidget | null>;
    createWidget: (type: PinWidget['type']) => Promise<PinWidget>;
  };
}
