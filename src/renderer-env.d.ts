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
  collapsed: boolean;
  width: number;
  height: number;
  activeTab: 'note' | 'todo' | 'clip';
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
  maxLines: number;
  hoverFull: boolean;
  scrollbar: 'always' | 'overlay' | 'hidden';
}

interface Window {
  pinApi: {
    ping: () => Promise<PinPingResult>;
    getSettings: () => Promise<PinSettings>;
    getWidget: () => Promise<PinWidget | null>;
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
