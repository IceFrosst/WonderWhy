// Keys and bridge nav share focus handling. The film has a picture and button row;
// the end keeps focus in its row; Turn it has only the picture (swipes turn/tilt).
// Back is handled by App: Home, or return from Turn it to the same beat.
import {useEffect, useRef} from 'react';
import type {RefObject} from 'react';
import {emitNav, onNav} from './bus';
import type {NavAction} from './bus';

export interface StageHandlers {
  mode: 'film' | 'end' | 'turn';
  pinch: () => void;
  swipe: (direction: -1 | 1) => void;
  up?: () => void;
  down?: () => void;
  /** Any wearer input (keys or bridge nav). */
  input?: () => void;
}

export const ROW_SELECTOR = '.xp-actions button';
const PICTURE_SELECTOR = '.xp-stage';
const KEY_ACTIONS: Record<string, NavAction> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Enter: 'next',
  ' ': 'next',
};
/** A click on the picture right after a handled pinch key is the same pinch (the simulator clicks too). */
const CLICK_AFTER_KEY_MS = 700;
let lastPinchKey = -Infinity;

/** Click on the picture: counts as a pinch unless a pinch key was just handled. */
export function pictureClickIsPinch(): boolean {
  return performance.now() - lastPinchKey > CLICK_AFTER_KEY_MS;
}

export function rowButtons(root: HTMLElement | null): HTMLButtonElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLButtonElement>(ROW_SELECTOR)).filter(button => !button.disabled);
}

export function focusPicture(root: HTMLElement | null): void {
  const picture = root?.querySelector<HTMLElement>(PICTURE_SELECTOR);
  if (picture && document.activeElement !== picture) picture.focus({preventScroll: true});
}

export function useStageControls(rootRef: RefObject<HTMLElement | null>, handlers: StageHandlers, enabled = true): void {
  const live = useRef(handlers);
  live.current = handlers;

  useEffect(() => {
    if (!enabled) return;
    const navigate = (action: NavAction): void => {
      const root = rootRef.current;
      const h = live.current;
      h.input?.();
      const row = rowButtons(root);
      let index = row.findIndex(button => button === document.activeElement);
      if (h.mode === 'end' && index < 0 && row.length) {
        index = 0;
        row[index].focus({preventScroll: true});
      }
      if (index >= 0 && h.mode !== 'turn') {
        if (action === 'left' || action === 'prev') row[Math.max(0, index - 1)].focus();
        else if (action === 'right') row[Math.min(row.length - 1, index + 1)].focus();
        else if (action === 'up' && h.mode !== 'end') focusPicture(root);
        else if (action === 'next' || action === 'deeper') row[index].click();
        return;
      }
      if (action === 'next' || action === 'deeper') h.pinch();
      else if (action === 'left' || action === 'prev') h.swipe(-1);
      else if (action === 'right') h.swipe(1);
      else if (action === 'down') {
        if (h.mode === 'turn') h.down?.();
        else row[0]?.focus();
      } else if (action === 'up') {
        focusPicture(root);
        h.up?.();
      }
    };
    const onKey = (event: KeyboardEvent): void => {
      const action = KEY_ACTIONS[event.key];
      const root = rootRef.current;
      if (!action || !root) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (action === 'next') {
        if (event.repeat) return;
        lastPinchKey = performance.now();
      }
      emitNav(action);
    };
    const off = onNav(navigate);
    window.addEventListener('keydown', onKey, true);
    return () => {
      off();
      window.removeEventListener('keydown', onKey, true);
    };
  }, [enabled, rootRef]);
}
