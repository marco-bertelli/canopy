import type { Bridge } from "../shared/contracts";
declare global {
  const __APP_VERSION__: string;
  interface Window {
    canopy?: Bridge;
  }
}
