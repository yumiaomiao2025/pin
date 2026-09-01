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
}

interface Window {
  pinApi: {
    ping: () => Promise<PinPingResult>;
    getWidget: () => Promise<PinWidget | null>;
    saveNote: (noteText: string) => Promise<PinWidget | null>;
    hideWindow: () => Promise<boolean>;
    setSize: (width: number, height: number) => Promise<PinWidget | null>;
    setOpacity: (opacity: number) => Promise<PinWidget | null>;
    setPin: (pin: boolean) => Promise<PinWidget | null>;
    setCollapsed: (collapsed: boolean) => Promise<PinWidget | null>;
    createWidget: (type: PinWidget['type']) => Promise<PinWidget>;
  };
}
