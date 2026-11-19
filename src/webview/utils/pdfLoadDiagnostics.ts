export const LOAD_STAGE_LABELS = {
  'waiting-host': '等待扩展宿主响应',
  'reading-file': '读取 PDF 文件',
  transferring: '等待文件传输',
  fetching: '下载 PDF 数据',
  closing: '释放上一份文档',
  decoding: '解码接收数据',
  worker: '启动 PDF Worker',
  parsing: '解析 PDF 结构',
  rendering: '绘制首屏画布',
  ready: '首屏画布完成',
  error: '加载失败',
} as const;

export type LoadStage = keyof typeof LOAD_STAGE_LABELS;
export interface HostLoadTimings {
  webviewReadyMs?: number;
  readMs?: number;
  prepareMs?: number;
  transferAckMs?: number;
}
export interface LoadTraceSnapshot {
  requestId: string;
  stage: LoadStage;
  elapsedMs: number;
  stageElapsedMs: number;
  slow: boolean;
  bytes?: number;
  pages?: number;
  host: HostLoadTimings;
  events: { stage: LoadStage; atMs: number }[];
  textLayerMs?: number;
  textLayerFailed?: boolean;
}

export const LOAD_WARNING_MS = 10_000;

// 只保存耗时、阶段和字节/页数，不包含路径、文件名或 PDF 正文。
export class PdfLoadTrace {
  private listeners = new Set<() => void>();
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };
  private notify(): void { this.listeners.forEach(listener => listener()); }
  private startedAt: number;
  private endedAt?: number;
  private events: LoadTraceSnapshot['events'] = [];
  private host: HostLoadTimings = {};
  private bytes?: number;
  private pages?: number;
  private textLayerMs?: number;
  private textLayerFailed?: boolean;

  constructor(
    public requestId: string,
    private now: () => number = () => performance.now(),
    private onEvent?: (stage: LoadStage, elapsedMs: number) => void,
  ) {
    this.startedAt = now();
    this.mark('waiting-host');
  }

  mark(stage: LoadStage): void {
    if (this.endedAt !== undefined || this.events.at(-1)?.stage === stage) return;
    const atMs = Math.max(0, Math.round(this.now() - this.startedAt));
    this.events.push({ stage, atMs });
    if (stage === 'ready' || stage === 'error') this.endedAt = this.startedAt + atMs;
    this.onEvent?.(stage, atMs);
    this.notify();
  }

  update(details: { bytes?: number; pages?: number; host?: HostLoadTimings }): void {
    if (details.bytes !== undefined) this.bytes = details.bytes;
    if (details.pages !== undefined) this.pages = details.pages;
    for (const key of ['webviewReadyMs', 'readMs', 'prepareMs', 'transferAckMs'] as const) {
      const value = details.host?.[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) this.host[key] = value;
    }
    this.notify();
  }

  textLayer(failed: boolean): void {
    if (this.textLayerMs !== undefined) return;
    this.textLayerMs = Math.max(0, Math.round(this.now() - this.startedAt));
    this.textLayerFailed = failed;
    this.notify();
  }

  snapshot(): LoadTraceSnapshot {
    const elapsedMs = Math.max(0, Math.round((this.endedAt ?? this.now()) - this.startedAt));
    const last = this.events[this.events.length - 1];
    const stageElapsedMs = elapsedMs - last.atMs;
    return {
      requestId: this.requestId, stage: last.stage, elapsedMs, stageElapsedMs,
      slow: this.endedAt === undefined && stageElapsedMs >= LOAD_WARNING_MS,
      bytes: this.bytes, pages: this.pages, host: { ...this.host },
      events: this.events.map(event => ({ ...event })),
      textLayerMs: this.textLayerMs, textLayerFailed: this.textLayerFailed,
    };
  }
}

export function formatLoadTrace(report: LoadTraceSnapshot): string {
  const lines = [
    `Lumen PDF 加载诊断（仅本地） · ${report.requestId}`,
    `当前阶段：${LOAD_STAGE_LABELS[report.stage]}`,
    `Webview 就绪后累计：${report.elapsedMs} ms`,
    `文件字节数：${report.bytes ?? '未知'}；页数：${report.pages ?? '未知'}`,
  ];
  const hostLabels: Record<keyof HostLoadTimings, string> = {
    webviewReadyMs: '宿主创建编辑器 → Webview 就绪',
    readMs: '宿主读取文件',
    prepareMs: '宿主准备二进制消息',
    transferAckMs: '宿主发送 → 接收确认（含回程和消息调度，非单向传输）',
  };
  for (const key of Object.keys(hostLabels) as (keyof HostLoadTimings)[]) {
    if (report.host[key] !== undefined) lines.push(`${hostLabels[key]}：${report.host[key]} ms`);
  }
  report.events.forEach((event, index) => {
    const end = report.events[index + 1]?.atMs ?? report.elapsedMs;
    lines.push(`${LOAD_STAGE_LABELS[event.stage]}：${end - event.atMs} ms（+${event.atMs} ms）`);
  });
  if (report.textLayerMs !== undefined) {
    lines.push(`首屏文字层${report.textLayerFailed ? '失败' : '完成'}：+${report.textLayerMs} ms`);
  }
  lines.push('各端使用各自的单调时钟；宿主计时与 Webview 阶段可能重叠，不应直接相加。');
  return lines.join('\n');
}
