#!/usr/bin/env node
// Checks that every relative link/image in tracked Markdown files resolves to a file or folder.
// Usage: node scripts/check-md-links.mjs [--all]   (default: only report; exit 1 on any broken link)
// Ignores http(s)/mailto links, pure #anchors, and anything inside fenced or inline code.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const files = execSync('git ls-files "*.md"', { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
const bad = [];
let checked = 0;

for (const file of files) {
  const text = readFileSync(path.join(root, file), 'utf8')
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ''))
    .replace(/`[^`\n]*`/g, '');
  const re = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g;
  const htmlRe = /<(?:img|a)\b[^>]*?(?:src|href)="([^"]+)"/g;
  const targets = [];
  for (const m of text.matchAll(re)) targets.push(m[1]);
  for (const m of text.matchAll(htmlRe)) targets.push(m[1]);
  for (const raw of targets) {
    if (/^(https?:|mailto:|tel:|#|data:)/i.test(raw)) continue;
    const rel = decodeURIComponent(raw.split('#')[0].split('?')[0]);
    if (!rel) continue;
    checked += 1;
    const target = rel.startsWith('/') ? path.join(root, rel) : path.resolve(root, path.dirname(file), rel);
    if (!existsSync(target)) bad.push(`${file}: ${raw}`);
  }
}

console.log(`Checked ${checked} relative links in ${files.length} Markdown files.`);
if (bad.length) {
  console.log(`BROKEN (${bad.length}):`);
  for (const b of bad) console.log('  ' + b);
  process.exit(1);
}
console.log('All relative links resolve.');
