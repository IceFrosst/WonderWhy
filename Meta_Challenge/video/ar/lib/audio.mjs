// node lib/audio.mjs CUT : builds the audio from <V>/config.audio and muxes it with out/<V>.mp4 -> out/<V>_audio.mp4
import { spawnSync } from 'node:child_process'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), V = process.argv[2] || 'CUT';
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, V, 'config.json'), 'utf8'));
const RAW = process.env.WONDERWHY_RAW || path.join(process.env.HOME || process.env.USERPROFILE || '', 'Videos/wonderwhy/raw');
const find = (name, dir) => {
  let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return null; }
  for (const e of ents) if (e.isFile() && e.name === name) return path.join(dir, e.name);
  for (const e of ents) if (e.isDirectory() && e.name !== '.src') { const r = find(name, path.join(dir, e.name)); if (r) return r; }
  return null;
};
const locate = a => { if (a.path) return path.isAbsolute(a.path) ? a.path : path.resolve(ROOT, V, a.path);
  return find(a.raw, path.join(RAW, '.src')) || find(a.raw, RAW); };
const hasAudio = f => { const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=index', '-of', 'csv=p=0', f], { encoding: 'utf8' }); return r.status === 0 && r.stdout.trim().length > 0; };
const D = cfg.duration, inputs = [], chains = [], labels = [];
inputs.push('-f', 'lavfi', '-t', String(D), '-i', 'anullsrc=r=48000:cl=stereo'); labels.push('[1:a]'); // (input 0 is the video) silence bed fixes the length
for (const a of cfg.audio || []) {
  if (a.mute) continue;
  const f = locate(a);
  if (!f || !fs.existsSync(f)) { console.warn(`warning: audio source ${a.raw || a.path} not found, skipped`); continue; }
  if (!hasAudio(f)) { console.warn(`warning: ${f} has no audio stream, skipped`); continue; }
  const n = inputs.filter(x => x === '-i').length + 1, speed = a.speed || 1, ms = Math.round((a.start || 0) * 1000), fd = Math.min(0.01, a.dur / 2);
  const f_ = [`atrim=start=${a.in || 0}:duration=${a.dur * speed}`, 'asetpts=PTS-STARTPTS'];
  let sp = speed; while (sp > 2) { f_.push('atempo=2'); sp /= 2; } while (sp < 0.5) { f_.push('atempo=0.5'); sp /= 0.5; }
  if (sp !== 1) f_.push(`atempo=${sp}`);
  f_.push(`volume=${a.gain ?? 1}`, `afade=t=in:d=${fd}`, `afade=t=out:st=${Math.max(0, a.dur - fd)}:d=${fd}`, 'aformat=sample_rates=48000:channel_layouts=stereo', `adelay=${ms}|${ms}`);
  inputs.push('-i', f); chains.push(`[${n}:a]${f_.join(',')}[a${n}]`); labels.push(`[a${n}]`);
}
if (cfg.music && cfg.music.path) {
  const mp = path.isAbsolute(cfg.music.path) ? cfg.music.path : path.resolve(ROOT, '../..', cfg.music.path);
  if (fs.existsSync(mp)) { const n = inputs.filter(x => x === '-i').length + 1; inputs.push('-i', mp);
    chains.push(`[${n}:a]atrim=0:${D},asetpts=PTS-STARTPTS,aformat=sample_rates=48000:channel_layouts=stereo,volume=${cfg.music.gain ?? 0.3}[a${n}]`); labels.push(`[a${n}]`); }
  else console.warn(`warning: music ${mp} not found, skipped`);
}
chains.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=first:dropout_transition=0,atrim=0:${D},loudnorm=I=-16:TP=-1.5:LRA=11[aout]`);
const vid = path.join(ROOT, 'out', `${V}.mp4`), out = path.join(ROOT, 'out', `${V}_audio.mp4`);
if (!fs.existsSync(vid)) { console.error(`missing ${vid}: render first`); process.exit(1); }
const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', vid, ...inputs, '-filter_complex', chains.join(';'), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status || 1);
console.log(`wrote ${out}`);
