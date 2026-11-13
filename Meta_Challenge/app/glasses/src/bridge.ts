// Glasses side of shared/PROTOCOL.md. Auto-reconnects with backoff.
export interface ShowMsg {
  type: 'show';
  reqId: string;
  objectId: string;
  label?: string;
  confidence?: number;
  question?: string;
  answer?: string;
}

export type BridgeMsg =
  | {type: 'detecting'; reqId: string; t_sent?: number}
  | ShowMsg
  | {type: 'nav'; action: 'next' | 'prev' | 'deeper' | 'done' | 'left' | 'right'}
  | {type: 'clear'}
  | {
      type: 'device';
      state: 'donned' | 'doffed' | 'battery_low' | 'thermal_hot' | 'offline' | 'online' | 'camera_denied';
    }
  | {type: 'error'; code: string; message: string};

export const DEFAULT_BRIDGE = 'ws://localhost:8787/ws';

/** Vite dev/preview ports talk to the local bridge; anywhere else (bridge-hosted, public HTTPS) uses the same origin. */
function defaultBridge(): string {
  const {protocol, host, port} = window.location;
  if (port === '4173' || port === '5173') return DEFAULT_BRIDGE;
  return `${protocol === 'https:' ? 'wss' : 'ws'}://${host}/ws`;
}

/**
 * `?bridge=ws://host:port/ws` overrides the default. Automated browsers (webdriver, e.g. the
 * test gate) only connect when `?bridge=` is explicit, so a missing local bridge does not
 * log a console error there. Returns null when no connection should be attempted.
 */
export function bridgeUrl(): string | null {
  try {
    const explicit = new URLSearchParams(window.location.search).get('bridge');
    if (explicit) return explicit;
    if (navigator.webdriver) return null;
  } catch {
    /* fall through to the default */
  }
  return defaultBridge();
}

export class BridgeClient {
  private ws: WebSocket | null = null;
  private timer: number | undefined;
  private delay = 500;
  private stopped = false;

  constructor(
    private url: string,
    private onMessage: (m: BridgeMsg) => void,
    private onStatus: (connected: boolean) => void,
  ) {}

  start(): void {
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.timer);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onclose = ws.onmessage = ws.onerror = null;
      ws.close();
    }
  }

  send(msg: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  private open(): void {
    if (this.stopped) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.retry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.delay = 500;
      this.onStatus(true);
      this.send({type: 'hello', client: 'glasses', ua: navigator.userAgent});
    };
    ws.onmessage = ev => {
      try {
        const m = JSON.parse(String(ev.data)) as BridgeMsg;
        if (m && typeof m.type === 'string') this.onMessage(m);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      this.onStatus(false);
      this.retry();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private retry(): void {
    if (this.stopped) return;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.open(), this.delay);
    this.delay = Math.min(this.delay * 2, 8000);
  }
}
