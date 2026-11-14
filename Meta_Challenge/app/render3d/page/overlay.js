// Captioned still (s<n>.png): the rest frame plus the lens layout of MODEL3D.md drawn in 2D.
// The glasses draw the same things live in the DOM; this is the phone / Android card version.
const SIZE = 600;
const MARGIN = 24;
const FONT = '"Noto Sans", "Segoe UI", Roboto, system-ui, sans-serif';
const WHITE = '#ffffff';
const SOFT = '#c9d4ff';
const GREEN = '#6dff9c';
const LABEL_GAP = 26;

function wrap(ctx, text, maxWidth) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  return lines;
}

/** Spread label text rows in one column so no two are closer than LABEL_GAP px. */
function spread(items, top, bottom) {
  items.sort((a, b) => a.y - b.y);
  for (let i = 0; i < items.length; i++) {
    items[i].ty = Math.min(bottom, Math.max(top, items[i].y));
    if (i > 0 && items[i].ty - items[i - 1].ty < LABEL_GAP) items[i].ty = items[i - 1].ty + LABEL_GAP;
  }
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i].ty > bottom) items[i].ty = bottom;
    if (i < items.length - 1 && items[i + 1].ty - items[i].ty < LABEL_GAP) items[i].ty = items[i + 1].ty - LABEL_GAP;
  }
}

export function drawCard(source, meta) {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(source, 0, 0, SIZE, SIZE);

  // Top line: object name and beat dots.
  ctx.textBaseline = 'middle';
  ctx.font = `400 18px ${FONT}`;
  ctx.fillStyle = SOFT;
  ctx.textAlign = 'left';
  ctx.fillText(meta.title, MARGIN, 20);
  for (let i = 0; i < meta.beats; i++) {
    const x = SIZE - MARGIN - 4 - (meta.beats - 1 - i) * 16;
    ctx.beginPath();
    ctx.arc(x, 20, 4, 0, Math.PI * 2);
    if (i <= meta.beat) {
      ctx.fillStyle = WHITE;
      ctx.fill();
    } else {
      ctx.strokeStyle = SOFT;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }

  // Caption at the bottom, at most 2 lines of 20 px.
  ctx.font = `400 20px ${FONT}`;
  const captionLines = wrap(ctx, meta.caption, SIZE - MARGIN * 2).slice(0, 2);
  const lineHeight = 27;
  const captionTop = SIZE - MARGIN - captionLines.length * lineHeight;
  ctx.fillStyle = WHITE;
  ctx.textBaseline = 'top';
  captionLines.forEach((line, i) => ctx.fillText(line, MARGIN, captionTop + i * lineHeight));

  // Number: bottom left over the stage.
  if (meta.number) {
    const bottom = captionTop - 10;
    ctx.textBaseline = 'alphabetic';
    ctx.font = `400 16px ${FONT}`;
    ctx.fillStyle = SOFT;
    ctx.fillText(meta.number.label ?? '', MARGIN, bottom);
    ctx.font = `600 44px ${FONT}`;
    ctx.fillStyle = GREEN;
    const value = String(meta.number.value ?? '');
    ctx.fillText(value, MARGIN, bottom - 24);
    const width = ctx.measureText(value).width;
    ctx.font = `600 26px ${FONT}`;
    ctx.fillText(String(meta.number.unit ?? ''), MARGIN + width + 8, bottom - 24);
  }

  // Labels in two margin columns with thin leaders to their anchors.
  const top = 52;
  const bottom = captionTop - (meta.number ? 90 : 16);
  for (const side of ['l', 'r']) {
    const items = (meta.labels ?? []).filter(label => label.side === side).map(label => ({...label}));
    spread(items, top, bottom);
    ctx.font = `400 18px ${FONT}`;
    ctx.textBaseline = 'middle';
    for (const item of items) {
      const width = ctx.measureText(item.text).width;
      const textX = side === 'l' ? MARGIN : SIZE - MARGIN;
      ctx.textAlign = side === 'l' ? 'left' : 'right';
      ctx.fillStyle = item.focus ? WHITE : SOFT;
      ctx.fillText(item.text, textX, item.ty);
      const startX = side === 'l' ? MARGIN + width + 8 : SIZE - MARGIN - width - 8;
      ctx.strokeStyle = 'rgba(201, 212, 255, 0.75)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(startX, item.ty);
      ctx.lineTo(item.x, item.y);
      ctx.stroke();
      ctx.fillStyle = SOFT;
      ctx.beginPath();
      ctx.arc(item.x, item.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.textAlign = 'left';
  return canvas.toDataURL('image/png');
}
