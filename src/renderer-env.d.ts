import type { PinApi } from './shared/pin-api';

declare global {
  interface Window {
    pinApi: PinApi;
  }
}
