export interface VsCodeWebviewApi {
  postMessage(message: unknown): void;
  getState<T = unknown>(): T | undefined;
  setState<T = unknown>(state: T): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeWebviewApi;
  }
}

let cachedApi: VsCodeWebviewApi | null | undefined;

export function getVsCodeApi(): VsCodeWebviewApi | null {
  if (cachedApi !== undefined) return cachedApi;
  if (typeof window !== 'undefined' && typeof window.acquireVsCodeApi === 'function') {
    try {
      cachedApi = window.acquireVsCodeApi();
      return cachedApi;
    } catch {
      cachedApi = null;
      return null;
    }
  }
  cachedApi = null;
  return null;
}

export function postToVsCodeHost(message: unknown): boolean {
  const api = getVsCodeApi();
  if (!api) return false;
  api.postMessage(message);
  return true;
}

export type IncomingHostMessage =
  | {
      type: 'loadPdf';
      url?: string;
      data?: number[] | ArrayBuffer | Uint8Array;
      fileName?: string;
    }
  | {
      type: 'toggleColorMode';
    }
  | {
      type: 'jumpToLocation';
      payload?: { page?: number };
    };
