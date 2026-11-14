import '@wearables-ui-toolkit/mrbd/styles.css';
import {OBJECTS} from './content';
import {createScene} from './scenes';
import type {Scene} from './scenes';

const FALLBACK_FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';
const PRODUCT_FONT = '"Noto Sans Local", "Noto Sans", system-ui, sans-serif';
let exportFont = FALLBACK_FONT;
const LENS_NAMES: Record<string, string> = {
  motion: 'Motion',
  inside: 'Inside',
  cutaway: 'Cutaway',
  flow: 'Flow',
  zoom: 'Zoom',
  whatif: 'What if',
  compare: 'Compare',
  number: 'The number',
};

interface StillOptions {
  objectId: string;
  chapterIndex: number;
  step: number;
  size?: number;
  settle?: number;
}

interface ClipOptions {
  objectId: string;
  chapterIndex: number;
  size?: number;
  fps?: number;
  secondsPerStep?: number;
}

interface CardClipOptions extends ClipOptions {
  crossfade?: number;
}

interface CardLayout {
  output: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  margin: number;
  stageTop: number;
  stageWidth: number;
  stageHeight: number;
  caption: string;
  captionLines: string[];
  captionTop: number;
  bodySize: number;
  bodyHeight: number;
  lensSize: number;
  lensName: string;
  scale: number;
}

interface ClipHandle {
  scene: Scene;
  surface: HTMLCanvasElement;
  mode: 'card' | 'clean';
  objectId: string;
  chapterIndex: number;
  size: number;
  fps: number;
  framesPerStep: number;
  totalFrames: number;
  crossfadeFrames: number;
  nextFrame: number;
  currentStep: number;
}

const clipHandles = new Map<string, ClipHandle>();
let nextHandleId = 1;

function canvas(size: number): HTMLCanvasElement {
  const result = document.createElement('canvas');
  result.width = size;
  result.height = size;
  return result;
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function nonNegative(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function integer(value: number | undefined, fallback: number): number {
  return Math.max(1, Math.round(positive(value, fallback)));
}

function safeStep(step: number, count: number): number {
  return Math.min(count, Math.max(1, Math.round(step)));
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
): number {
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function getChapter(objectId: string, chapterIndex: number) {
  const object = OBJECTS.find(item => item.id === objectId);
  const chapter = object?.chapters[chapterIndex];
  return object && chapter ? {object, chapter} : null;
}

function createCardLayout(
  found: NonNullable<ReturnType<typeof getChapter>>,
  size: number,
  step: number,
): CardLayout {
  const {object, chapter} = found;
  const scale = size / 600;
  const margin = 24 * scale;
  const output = canvas(size);
  const ctx = output.getContext('2d');
  if (!ctx) throw new Error('Could not create card canvas context');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  const titleSize = 28 * scale;
  const bodySize = 20 * scale;
  const lensSize = 16 * scale;
  const titleHeight = 34 * scale;
  const bodyHeight = 27 * scale;
  const title = `${object.label} \u00b7 ${chapter.title}`;
  const lead = chapter.lead ?? object.answer;

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${titleSize}px ${exportFont}`;
  const titleLines = wrap(ctx, title, size - margin * 2);
  let y = drawLines(ctx, titleLines, margin, margin, titleHeight);
  ctx.fillStyle = '#c9d4ff';
  ctx.font = `400 ${bodySize}px ${exportFont}`;
  const leadLines = wrap(ctx, lead, size - margin * 2);
  y = drawLines(ctx, leadLines, margin, y + 4 * scale, bodyHeight);

  const currentStep = safeStep(step, chapter.captions.length);
  const caption = `Step ${currentStep}/${chapter.captions.length}. ${chapter.captions[currentStep - 1]}`;
  ctx.font = `400 ${bodySize}px ${exportFont}`;
  const captionLines = wrap(ctx, caption, size - margin * 2);
  const captionTop = size - margin - lensSize - 10 * scale - captionLines.length * bodyHeight;
  const stageTop = y + 8 * scale;
  const stageBottom = captionTop - 10 * scale;
  const stageHeight = Math.max(1, Math.floor(stageBottom - stageTop));
  const stageWidth = Math.max(1, Math.floor(size - margin * 2));

  return {
    output,
    ctx,
    margin,
    stageTop,
    stageWidth,
    stageHeight,
    caption,
    captionLines,
    captionTop,
    bodySize,
    bodyHeight,
    lensSize,
    lensName: LENS_NAMES[chapter.lens ?? ''] ?? chapter.lens ?? chapter.scene,
    scale,
  };
}

function drawCardCaption(layout: CardLayout, alpha = 1, target = layout): void {
  const {ctx} = target;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffffff';
  ctx.font = `400 ${layout.bodySize}px ${exportFont}`;
  ctx.textAlign = 'left';
  drawLines(ctx, layout.captionLines, layout.margin, layout.captionTop, layout.bodyHeight);
  ctx.restore();
}

function drawCardLens(layout: CardLayout): void {
  const {ctx} = layout;
  ctx.fillStyle = '#c9d4ff';
  ctx.font = `400 ${layout.lensSize}px ${exportFont}`;
  ctx.textAlign = 'right';
  ctx.fillText(
    layout.lensName,
    layout.output.width - layout.margin,
    layout.output.height - layout.margin - layout.lensSize,
  );
}

function renderSettledScene(
  found: NonNullable<ReturnType<typeof getChapter>>,
  step: number,
  width: number,
  height: number,
  settle: number | undefined,
): HTMLCanvasElement | null {
  const scene = createScene(found.chapter.scene, found.chapter.spec);
  if (!scene) return null;
  const surface = canvas(width);
  surface.height = height;
  const sceneCtx = surface.getContext('2d');
  if (!sceneCtx) throw new Error('Could not create scene canvas context');

  try {
    scene.init(sceneCtx, width, height);
    scene.setStep(step);
    const dt = 1 / 30;
    const frames = Math.max(1, Math.ceil(positive(settle, 2) / dt));
    for (let frame = 0; frame < frames; frame++) scene.frame(dt);
  } finally {
    scene.dispose();
  }
  return surface;
}

function renderStill(options: StillOptions): string | null {
  const found = getChapter(options.objectId, options.chapterIndex);
  if (!found) throw new Error(`Unknown object/chapter: ${options.objectId}/${options.chapterIndex}`);

  const size = integer(options.size, 600);
  const currentStep = safeStep(options.step, found.chapter.captions.length);
  const layout = createCardLayout(found, size, currentStep);
  const stage = renderSettledScene(
    found,
    currentStep,
    layout.stageWidth,
    layout.stageHeight,
    options.settle,
  );
  if (!stage) return null;
  layout.ctx.drawImage(stage, layout.margin, layout.stageTop);

  drawCardCaption(layout);
  drawCardLens(layout);
  return layout.output.toDataURL('image/png');
}

function renderSceneStill(options: StillOptions): string | null {
  const found = getChapter(options.objectId, options.chapterIndex);
  if (!found) throw new Error(`Unknown object/chapter: ${options.objectId}/${options.chapterIndex}`);

  const size = integer(options.size, 600);
  const scale = size / 600;
  const margin = 12 * scale;
  const stageSize = Math.max(1, Math.floor(size - margin * 2));
  const stage = renderSettledScene(
    found,
    safeStep(options.step, found.chapter.captions.length),
    stageSize,
    stageSize,
    options.settle,
  );
  if (!stage) return null;

  const output = canvas(size);
  const ctx = output.getContext('2d');
  if (!ctx) throw new Error('Could not create clean still canvas context');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(stage, margin, margin, stageSize, stageSize);
  return output.toDataURL('image/png');
}

function renderClip(options: ClipOptions): string[] | null {
  const found = getChapter(options.objectId, options.chapterIndex);
  if (!found) throw new Error(`Unknown object/chapter: ${options.objectId}/${options.chapterIndex}`);
  const {chapter} = found;
  const scene = createScene(chapter.scene, chapter.spec);
  if (!scene) return null;

  const size = integer(options.size, 264);
  const fps = integer(options.fps, 15);
  const secondsPerStep = positive(options.secondsPerStep, 3);
  const framesPerStep = Math.max(1, Math.round(fps * secondsPerStep));
  const surface = canvas(size);
  const ctx = surface.getContext('2d');
  if (!ctx) throw new Error('Could not create clip canvas context');
  const frames: string[] = [];

  try {
    scene.init(ctx, size, size);
    for (let step = 1; step <= chapter.captions.length; step++) {
      scene.setStep(step);
      for (let frame = 0; frame < framesPerStep; frame++) {
        scene.frame(1 / fps);
        frames.push(surface.toDataURL('image/png'));
      }
    }
  } finally {
    scene.dispose();
  }
  return frames;
}

function startStream(options: CardClipOptions, mode: ClipHandle['mode']) {
  const found = getChapter(options.objectId, options.chapterIndex);
  if (!found) throw new Error(`Unknown object/chapter: ${options.objectId}/${options.chapterIndex}`);
  const scene = createScene(found.chapter.scene, found.chapter.spec);
  if (!scene) return null;

  const size = integer(options.size, 1080);
  const fps = integer(options.fps, 30);
  const secondsPerStep = positive(options.secondsPerStep, 4);
  const framesPerStep = Math.max(1, Math.round(fps * secondsPerStep));
  let surface: HTMLCanvasElement;
  if (mode === 'card') {
    const firstLayout = createCardLayout(found, size, 1);
    surface = canvas(firstLayout.stageWidth);
    surface.height = firstLayout.stageHeight;
  } else {
    surface = canvas(size);
  }
  const ctx = surface.getContext('2d');
  if (!ctx) throw new Error('Could not create streamed clip canvas context');
  scene.init(ctx, surface.width, surface.height);
  scene.setStep(1);

  const handle = String(nextHandleId++);
  const state: ClipHandle = {
    scene,
    surface,
    mode,
    objectId: options.objectId,
    chapterIndex: options.chapterIndex,
    size,
    fps,
    framesPerStep,
    totalFrames: framesPerStep * found.chapter.captions.length,
    crossfadeFrames: Math.max(0, Math.round(fps * nonNegative(options.crossfade, 0.25))),
    nextFrame: 0,
    currentStep: 1,
  };
  clipHandles.set(handle, state);
  return {handle, totalFrames: state.totalFrames};
}

function streamNext(handle: string, count: number): string[] {
  const state = clipHandles.get(handle);
  if (!state) throw new Error(`Unknown clip handle: ${handle}`);
  const found = getChapter(state.objectId, state.chapterIndex);
  if (!found) throw new Error(`Unknown object/chapter: ${state.objectId}/${state.chapterIndex}`);
  const frames: string[] = [];
  const amount = Math.max(1, Math.round(count));
  const end = Math.min(state.totalFrames, state.nextFrame + amount);
  while (state.nextFrame < end) {
    const step = Math.floor(state.nextFrame / state.framesPerStep) + 1;
    const frameInStep = state.nextFrame % state.framesPerStep;
    if (step !== state.currentStep) {
      state.scene.setStep(step);
      state.currentStep = step;
    }
    state.scene.frame(1 / state.fps);

    if (state.mode === 'clean') {
      frames.push(state.surface.toDataURL('image/png'));
    } else {
      const layout = createCardLayout(found, state.size, step);
      layout.ctx.drawImage(
        state.surface,
        0,
        0,
        state.surface.width,
        state.surface.height,
        layout.margin,
        layout.stageTop,
        layout.stageWidth,
        layout.stageHeight,
      );
      if (step > 1 && frameInStep < state.crossfadeFrames && state.crossfadeFrames > 1) {
        const progress = frameInStep / (state.crossfadeFrames - 1);
        const previous = createCardLayout(found, state.size, step - 1);
        drawCardCaption(previous, 1 - progress, layout);
        drawCardCaption(layout, progress);
      } else {
        drawCardCaption(layout);
      }
      drawCardLens(layout);
      frames.push(layout.output.toDataURL('image/png'));
    }
    state.nextFrame++;
  }
  return frames;
}

function streamEnd(handle: string): void {
  const state = clipHandles.get(handle);
  if (!state) return;
  clipHandles.delete(handle);
  state.scene.dispose();
}

const lensExport = {
  list: () => OBJECTS.flatMap(object => object.chapters.map(chapter => ({
    objectId: object.id,
    label: object.label,
    lensId: `${object.id}.${chapter.lens}`,
    kind: chapter.lens ?? chapter.scene,
    title: chapter.title,
    lead: chapter.lead ?? object.answer,
    captions: [...chapter.captions],
  }))),
  still: renderStill,
  sceneStill: renderSceneStill,
  clip: renderClip,
  cardClipStart: (options: CardClipOptions) => startStream(options, 'card'),
  cardClipNext: streamNext,
  cardClipEnd: streamEnd,
  sceneClipStart: (options: ClipOptions) => startStream(options, 'clean'),
  sceneClipNext: streamNext,
  sceneClipEnd: streamEnd,
};

declare global {
  interface Window {
    __lensExport: typeof lensExport;
  }
}

async function prepareExportFonts(): Promise<void> {
  const localFacesId = 'uit-noto-sans-local-faces';
  if (!document.getElementById(localFacesId)) {
    const style = document.createElement('style');
    style.id = localFacesId;
    style.textContent = `
@font-face {
  font-family: 'Noto Sans Local';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: local('Noto Sans'), local('Noto Sans Regular'), local('NotoSans-Regular');
}
@font-face {
  font-family: 'Noto Sans Local';
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: local('Noto Sans Medium'), local('NotoSans-Medium');
}
@font-face {
  font-family: 'Noto Sans Local';
  font-style: normal;
  font-weight: 700;
  font-display: swap;
  src: local('Noto Sans Bold'), local('NotoSans-Bold');
}`;
    document.head.appendChild(style);
  }

  const fontLinkId = 'uit-noto-sans-font';
  let fontLink = document.getElementById(fontLinkId) as HTMLLinkElement | null;
  let createdFontLink = false;
  if (!fontLink) {
    fontLink = document.createElement('link');
    fontLink.id = fontLinkId;
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans:wght@400;500;700&display=swap';
    document.head.appendChild(fontLink);
    createdFontLink = true;
  }
  const remoteStylesLoaded = Boolean(fontLink.sheet) || await new Promise<boolean>(resolve => {
    const timeout = window.setTimeout(() => resolve(false), 5000);
    fontLink.addEventListener('load', () => {
      window.clearTimeout(timeout);
      resolve(true);
    }, {once: true});
    fontLink.addEventListener('error', () => {
      window.clearTimeout(timeout);
      resolve(false);
    }, {once: true});
  });
  if (!remoteStylesLoaded && createdFontLink) fontLink.remove();

  try {
    await document.fonts.ready;
    const localFaces = await document.fonts.load('600 20px "Noto Sans Local"').catch(() => []);
    const remoteFaces = remoteStylesLoaded
      ? await document.fonts.load('600 20px "Noto Sans"').catch(() => [])
      : [];
    if (localFaces.length || remoteFaces.length) {
      exportFont = PRODUCT_FONT;
      document.body.style.fontFamily = PRODUCT_FONT;
    }
  } catch {
    document.body.style.fontFamily = FALLBACK_FONT;
  }
}

await prepareExportFonts();
window.__lensExport = lensExport;
