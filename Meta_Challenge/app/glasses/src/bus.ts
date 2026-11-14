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
