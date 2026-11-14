import {OBJECTS} from './content';
import {createScene} from './scenes';

const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';
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

function canvas(size: number): HTMLCanvasElement {
  const result = document.createElement('canvas');
  result.width = size;
  result.height = size;
  return result;
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function integer(value: number | undefined, fallback: number): number {
  return Math.max(1, Math.round(positive(value, fallback)));
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

function renderStill(options: StillOptions): string | null {
  const found = getChapter(options.objectId, options.chapterIndex);
  if (!found) throw new Error(`Unknown object/chapter: ${options.objectId}/${options.chapterIndex}`);
  const {object, chapter} = found;
  const scene = createScene(chapter.scene, chapter.spec);
  if (!scene) return null;

  const size = integer(options.size, 600);
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
  const title = `${object.label} · ${chapter.title}`;
  const lead = chapter.lead ?? object.answer;

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${titleSize}px ${FONT}`;
  const titleLines = wrap(ctx, title, size - margin * 2);
  let y = drawLines(ctx, titleLines, margin, margin, titleHeight);
  ctx.fillStyle = '#c9d4ff';
  ctx.font = `400 ${bodySize}px ${FONT}`;
  const leadLines = wrap(ctx, lead, size - margin * 2);
  y = drawLines(ctx, leadLines, margin, y + 4 * scale, bodyHeight);

  const safeStep = Math.min(chapter.captions.length, Math.max(1, Math.round(options.step)));
  const caption = `Step ${safeStep}/${chapter.captions.length}. ${chapter.captions[safeStep - 1]}`;
  ctx.font = `400 ${bodySize}px ${FONT}`;
  const captionLines = wrap(ctx, caption, size - margin * 2);
  const captionTop = size - margin - lensSize - 10 * scale - captionLines.length * bodyHeight;
  const stageTop = y + 8 * scale;
  const stageBottom = captionTop - 10 * scale;
  const stageHeight = Math.max(1, Math.floor(stageBottom - stageTop));
  const stageWidth = Math.max(1, Math.floor(size - margin * 2));
  const stage = canvas(stageWidth);
  stage.height = stageHeight;
  const sceneCtx = stage.getContext('2d');
  if (!sceneCtx) throw new Error('Could not create scene canvas context');

  try {
    scene.init(sceneCtx, stageWidth, stageHeight);
    scene.setStep(safeStep);
    const dt = 1 / 30;
    const frames = Math.max(1, Math.ceil(positive(options.settle, 2) / dt));
    for (let frame = 0; frame < frames; frame++) scene.frame(dt);
    ctx.drawImage(stage, margin, stageTop);
  } finally {
    scene.dispose();
  }

  ctx.fillStyle = '#ffffff';
  ctx.font = `400 ${bodySize}px ${FONT}`;
  drawLines(ctx, captionLines, margin, captionTop, bodyHeight);
  ctx.fillStyle = '#c9d4ff';
  ctx.font = `400 ${lensSize}px ${FONT}`;
  ctx.textAlign = 'right';
  ctx.fillText(LENS_NAMES[chapter.lens ?? ''] ?? chapter.lens ?? chapter.scene, size - margin, size - margin - lensSize);
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
  clip: renderClip,
};

declare global {
  interface Window {
    __lensExport: typeof lensExport;
  }
}

window.__lensExport = lensExport;
