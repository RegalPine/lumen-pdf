import type { HostLoadTimings } from './pdfLoadDiagnostics';

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

export type PdfBinaryData = number[] | ArrayBuffer | Uint8Array | {
  type: 'Buffer';
  data: number[];
};

export function decodePdfBytes(data: unknown): Uint8Array {
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (data instanceof ArrayBuffer) {
    bytes = new Uint8Array(data);
  } else {
    // 兼容旧版 number[] 和 Node.js Buffer 经 JSON 序列化后的消息。
    const values = data && typeof data === 'object' && 'type' in data && data.type === 'Buffer' && 'data' in data
      ? data.data : data;
    if (!Array.isArray(values)) {
      throw new Error('PDF 数据传输格式无效，请重新打开文件。');
    }
    for (const value of values) {
      if (!Number.isInteger(value) || value < 0 || value > 255) {
        throw new Error('PDF 数据传输包含无效字节，请重新打开文件。');
      }
    }
    bytes = new Uint8Array(values);
  }
  if (bytes.byteLength === 0) {
    throw new Error('收到的 PDF 数据为空（0 字节），请检查文件或重新打开。');
  }
  return bytes;
}

export type IncomingHostMessage =
  | {
      type: 'loadPdf';
      url?: string;
      data?: PdfBinaryData;
      fileName?: string;
      requestId?: string;
      timings?: HostLoadTimings;
    }
  | {
      type: 'pdfLoadProgress';
      requestId: string;
      stage: 'reading-file' | 'transferring';
    }
  | {
      type: 'pdfLoadTiming';
      requestId: string;
      timings: HostLoadTimings;
    }
  | {
      type: 'pdfLoadError';
      requestId: string;
      message: string;
    }
  | {
      type: 'toggleColorMode';
    }
  | {
      type: 'jumpToLocation';
      payload?: { page?: number };
    };
