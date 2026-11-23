/// <reference types="vite/client" />
import type { NeuroMrApi } from "../../preload/index.js";

declare global {
  interface Window {
    neuromr: NeuroMrApi;
  }
}
