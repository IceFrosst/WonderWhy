export type Step = 1 | 2 | 3;

export interface Readout {
  label: string;
  value: string;
}

/**
 * Every scene draws only through a CanvasRenderingContext2D and advances by dt,
 * so the same code can later be driven offscreen to render video.
 */
export interface Scene {
  init(ctx: CanvasRenderingContext2D, w: number, h: number): void;
  resize(w: number, h: number): void;
  /** axis x = left/right, y = up/down; dir -1 or +1. */
  setParam(axis: 'x' | 'y', dir: -1 | 1): void;
  setStep(step: Step): void;
  /** Advance by dt seconds, draw one frame, return the live DOM readouts. */
  frame(dt: number): Readout[];
  /** Primary parameter value (for the `state` message). */
  param(): number;
  dispose(): void;
}
