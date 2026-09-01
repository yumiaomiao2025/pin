interface PinPingResult {
  ok: boolean;
  version: string;
}

interface Window {
  pinApi: {
    ping: () => Promise<PinPingResult>;
  };
}
