// Tiny pub/sub so keyboard input and bridge `nav` messages drive the same handlers.
export type NavAction = 'next' | 'prev' | 'deeper' | 'done' | 'left' | 'right' | 'up' | 'down' | 'demo';

type Listener = (a: NavAction) => void;
const listeners = new Set<Listener>();

export function onNav(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function emitNav(a: NavAction): void {
  listeners.forEach(fn => fn(a));
}

// A pop-up card on top of a screen gets keys first. Registered at module load, so it runs before every
// screen's own capture-phase key handler (those register later, in effects). Return true to swallow the key.
type KeyGate = (e: KeyboardEvent) => boolean;
let keyGate: KeyGate | null = null;

export function setKeyGate(gate: KeyGate | null): void {
  keyGate = gate;
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', e => {
    if (keyGate?.(e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, true);
}
