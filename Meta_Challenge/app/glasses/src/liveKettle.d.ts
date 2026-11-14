interface KettlePose {
  angle: number;
  pitch: number;
  zoom: number;
  x: number;
  y: number;
}

export function createLiveKettle(canvas: HTMLCanvasElement): {
  draw(pose: KettlePose, separation: number): void;
  dispose(): void;
};
