// Glasses side of shared/PROTOCOL.md. Auto-reconnects with backoff.
export interface ShowMsg {
  type: 'show';
  reqId: string;
  objectId: string;
  label?: string;
  confidence?: number;
  question?: string;
  answer?: string;
  lensHint?: {id: string; step: number};
  lowConfidence?: boolean;
  summary?: string;
  steps?: string[];
  lenses?: Array<{
    id: string;
    kind: 'motion' | 'inside' | 'cutaway' | 'flow' | 'zoom' | 'whatif' | 'compare' | 'number';
    title: string;
    lead?: string;
    steps: string[];
    specText?: unknown;
    knobLabels?: Array<string | null>;
  }>;
  media?: {
    base: string;
    lenses: Record<string, {stills?: string[]; clip?: string}>;
  };
  replay?: boolean;
  ageMs?: number;
  /** A sketch for an unknown object is being made; the `sketch` frame follows. */
  sketchPending?: boolean;
  /** Generated explanation (untrusted; validate with sketchToObject). */
  sketch?: unknown;
  /** Language of the library text in this message (`en`, `fi`, ...). */
  lang?: string;
  /** The answer came from a dev-only stand-in model. */
  standIn?: boolean;
}

export type BridgeMsg =
  | {type: 'detecting'; reqId: string; t_sent?: number; timeoutMs?: number}
  | ShowMsg
  | {type: 'sketch'; reqId: string; sketch?: unknown; error?: string}
  | {type: 'ping'; t_sent?: number}
  | {type: 'nav'; action: 'next' | 'prev' | 'deeper' | 'done' | 'left' | 'right' | 'up' | 'down' | 'demo'}
  | {type: 'clear'}
  | {
      type: 'device';
      state:
        | 'donned'
        | 'doffed'
        | 'battery_low'
        | 'thermal_hot'
        | 'offline'
        | 'online'
        | 'camera_denied'
        | 'first_run';
    }
  | {type: 'error'; code: string; message: string; reqId?: string};

export const DEFAULT_BRIDGE = 'ws://localhost:8787/ws';

const TEXT_LIMIT = 300;
const LENS_KINDS = new Set(['motion', 'inside', 'cutaway', 'flow', 'zoom', 'whatif', 'compare', 'number']);
const NAV_ACTIONS = new Set(['next', 'prev', 'deeper', 'done', 'left', 'right', 'up', 'down', 'demo']);
const DEVICE_STATES = new Set([
  'donned',
  'doffed',
  'battery_low',
  'thermal_hot',
  'offline',
  'online',
  'camera_denied',
  'first_run',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value.slice(0, TEXT_LIMIT) : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/** Copy a wire frame into the small, typed shape the UI accepts. */
function sanitiseFrame(value: unknown): BridgeMsg | null {
  if (!isRecord(value) || typeof value.type !== 'string') return null;
  if (value.type === 'detecting') {
    const reqId = text(value.reqId);
    if (reqId === undefined) return null;
    return {type: 'detecting', reqId, ...(finite(value.t_sent) === undefined ? {} : {t_sent: finite(value.t_sent)}),
      ...(finite(value.timeoutMs) === undefined ? {} : {timeoutMs: finite(value.timeoutMs)})};
  }
  if (value.type === 'show') {
    const reqId = text(value.reqId);
    const objectId = text(value.objectId);
    if (reqId === undefined || objectId === undefined) return null;
    const message: ShowMsg = {type: 'show', reqId, objectId};
    for (const key of ['label', 'question', 'answer', 'summary', 'lang'] as const) {
      const safe = text(value[key]);
      if (safe !== undefined) message[key] = safe;
    }
    const confidence = finite(value.confidence);
    if (confidence !== undefined) message.confidence = confidence;
    if (value.lowConfidence === true) message.lowConfidence = true;
    if (value.replay === true) message.replay = true;
    if (value.sketchPending === true) message.sketchPending = true;
    if (value.standIn === true) message.standIn = true;
    const ageMs = finite(value.ageMs);
    if (ageMs !== undefined) message.ageMs = ageMs;
    if (value.sketch !== undefined) message.sketch = value.sketch;
    if (isRecord(value.lensHint)) {
      const id = text(value.lensHint.id);
      const step = finite(value.lensHint.step);
      if (id !== undefined && step !== undefined) message.lensHint = {id, step};
    }
    if (Array.isArray(value.steps)) message.steps = value.steps.flatMap(item => {
      const safe = text(item);
      return safe === undefined ? [] : [safe];
    });
    if (Array.isArray(value.lenses)) {
      message.lenses = value.lenses.flatMap(item => {
        if (!isRecord(item)) return [];
        const id = text(item.id);
        const kind = text(item.kind);
        const title = text(item.title);
        if (id === undefined || kind === undefined || title === undefined || !LENS_KINDS.has(kind) || !Array.isArray(item.steps)) {
          return [];
        }
        const lead = text(item.lead);
        const knobLabels = Array.isArray(item.knobLabels) && item.knobLabels.every(label => label === null || typeof label === 'string')
          ? item.knobLabels.map(label => label === null ? null : label.slice(0, TEXT_LIMIT))
          : undefined;
        return [{
          id,
          kind: kind as NonNullable<ShowMsg['lenses']>[number]['kind'],
          title,
          ...(lead === undefined ? {} : {lead}),
          ...(item.specText === undefined ? {} : {specText: item.specText}),
          ...(knobLabels === undefined ? {} : {knobLabels}),
          steps: item.steps.flatMap(step => {
            const safe = text(step);
            return safe === undefined ? [] : [safe];
          }),
        }];
      });
    }
    return message;
  }
  if (value.type === 'sketch') {
    const reqId = text(value.reqId);
    if (reqId === undefined) return null;
    return {type: 'sketch', reqId, ...(value.sketch === undefined ? {} : {sketch: value.sketch}),
      ...(text(value.error) === undefined ? {} : {error: text(value.error)})};
  }
  if (value.type === 'ping') {
    const tSent = finite(value.t_sent);
    return {type: 'ping', ...(tSent === undefined ? {} : {t_sent: tSent})};
  }
  if (value.type === 'nav') {
    const action = text(value.action);
    return action !== undefined && NAV_ACTIONS.has(action)
      ? {type: 'nav', action: action as Extract<BridgeMsg, {type: 'nav'}>['action']}
      : null;
  }
  if (value.type === 'clear') return {type: 'clear'};
  if (value.type === 'device') {
    const state = text(value.state);
    return state !== undefined && DEVICE_STATES.has(state)
      ? {type: 'device', state: state as Extract<BridgeMsg, {type: 'device'}>['state']}
      : null;
  }
  if (value.type === 'error') {
    const code = text(value.code) ?? '';
    const message = text(value.message) ?? '';
    const reqId = text(value.reqId);
    return {type: 'error', code, message, ...(reqId === undefined ? {} : {reqId})};
  }
  return null;
}

let tokenRead = false;
let storedToken: string | null = null;

function readToken(): string | null {
  if (tokenRead) return storedToken;
  tokenRead = true;

  let queryToken: string | null = null;
  try {
    const url = new URL(window.location.href);
    queryToken = url.searchParams.get('k');
    // Preferred form is the fragment (#k=...): it never reaches the server or its logs.
    const fragment = new URLSearchParams(url.hash.replace(/^#/, ''));
    const fragmentToken = fragment.get('k');
    if (fragmentToken !== null) {
      queryToken = fragmentToken;
      fragment.delete('k');
      url.hash = fragment.toString();
    }
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
      this.onStatus(true);
      this.armHeartbeat();
      const hello: Record<string, unknown> = {type: 'hello', client: 'glasses', ua: navigator.userAgent};
      if (this.token !== null && this.canSendToken()) hello.token = this.token;
      this.send(hello);
    };
    ws.onmessage = ev => {
      this.delay = 500;
      this.armHeartbeat();
      try {
        const m = sanitiseFrame(JSON.parse(String(ev.data)));
        if (m) {
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

  private canSendToken(): boolean {
    try {
      const endpoint = new URL(this.url, window.location.href);
      return endpoint.host === window.location.host || endpoint.hostname === 'localhost' || endpoint.hostname === '127.0.0.1';
    } catch {
      return false;
    }
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
