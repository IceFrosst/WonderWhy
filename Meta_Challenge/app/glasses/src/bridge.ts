// Glasses side of shared/PROTOCOL.md. Auto-reconnects with backoff.
export interface ShowMsg {
  type: 'show';
  reqId: string;
  objectId: string;
  label?: string;
  confidence?: number;
  question?: string;
  answer?: string;
  lowConfidence?: boolean;
  summary?: string;
  steps?: string[];
  lenses?: Array<{
    id: string;
    kind: 'motion' | 'inside' | 'cutaway' | 'flow' | 'zoom' | 'whatif' | 'compare' | 'number';
    title: string;
    lead?: string;
    steps: string[];
  }>;
  media?: {
    base: string;
    lenses: Record<string, {stills?: string[]; clip?: string}>;
  };
  replay?: boolean;
  ageMs?: number;
}

export type BridgeMsg =
  | {type: 'detecting'; reqId: string; t_sent?: number; timeoutMs?: number}
  | ShowMsg
  | {type: 'ping'; t_sent?: number}
  | {type: 'nav'; action: 'next' | 'prev' | 'deeper' | 'done' | 'left' | 'right'}
  | {type: 'clear'}
  | {
      type: 'device';
      state: 'donned' | 'doffed' | 'battery_low' | 'thermal_hot' | 'offline' | 'online' | 'camera_denied';
    }
  | {type: 'error'; code: string; message: string; reqId?: string};

export const DEFAULT_BRIDGE = 'ws://localhost:8787/ws';

let tokenRead = false;
let storedToken: string | null = null;

function readToken(): string | null {
  if (tokenRead) return storedToken;
  tokenRead = true;

  let queryToken: string | null = null;
  try {
    const url = new URL(window.location.href);
    queryToken = url.searchParams.get('k');
    if (queryToken !== null) {
      url.searchParams.delete('k');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
    }
  } catch {
    /* keep connecting even when the address cannot be inspected */
  }

  try {
    if (queryToken !== null) localStorage.setItem('lens.token', queryToken);
    storedToken = localStorage.getItem('lens.token');
  } catch {
    storedToken = null;
  }
  return storedToken;
}

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
  readToken();
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
  private heartbeatTimer: number | undefined;
  private delay = 500;
  private stopped = false;
  private token: string | null = null;

  constructor(
    private url: string,
    private onMessage: (m: BridgeMsg) => void,
    private onStatus: (connected: boolean, closeCode?: number) => void,
  ) {}

  start(): void {
    this.stopped = false;
    this.token = readToken();
    this.open();
  }

  stop(): void {
    this.stopped = true;
    window.clearTimeout(this.timer);
    window.clearTimeout(this.heartbeatTimer);
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
      this.armHeartbeat();
      const hello: Record<string, unknown> = {type: 'hello', client: 'glasses', ua: navigator.userAgent};
      if (this.token !== null) hello.token = this.token;
      this.send(hello);
    };
    ws.onmessage = ev => {
      this.armHeartbeat();
      try {
        const m = JSON.parse(String(ev.data)) as BridgeMsg;
        if (m && typeof m.type === 'string') {
          if (m.type === 'ping') this.send({type: 'pong'});
          this.onMessage(m);
        }
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = ev => {
      window.clearTimeout(this.heartbeatTimer);
      if (ev.code === 4401) {
        this.stopped = true;
        window.clearTimeout(this.timer);
      }
      this.onStatus(false, ev.code);
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

  private armHeartbeat(): void {
    window.clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = window.setTimeout(() => {
      // A dead link may never finish the close handshake, so do not wait for onclose.
      const ws = this.ws;
      if (!ws) return;
      this.ws = null;
      ws.onopen = ws.onclose = ws.onmessage = ws.onerror = null;
      ws.close();
      this.onStatus(false);
      this.retry();
    }, 25000);
  }
}
