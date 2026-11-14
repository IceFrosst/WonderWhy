// The live API of the shared renderer, loaded only by import('@r3d/scene.js').
declare module '@r3d/scene.js' {
  import type {Scene, Texture, WebGLRenderer} from 'three';
  export interface LiveLabel {
    kind: 'label' | 'callout';
    text: string;
    side: 'l' | 'r';
    x: number;
    y: number;
  }
  export interface View {
    yaw?: number;
    pitch?: number;
    explode?: number | null;
  }
  export interface BeatPlan {
    dur: number;
    loopFrom: number;
    frames: number;
    loopFrame: number;
    beatDur: number;
  }
  export class Explore {
    constructor(canvas: HTMLCanvasElement, options: {live: boolean});
    load(spec: unknown): unknown;
    plan(beat: number): BeatPlan;
    renderAt(beat: number, t: number): unknown;
    labelsAt(beat: number, t: number): LiveLabel[];
    setView(view?: View): void;
    clear(): void;
    renderer: WebGLRenderer;
    scene: Scene;
    envMap?: Texture;
  }
}
