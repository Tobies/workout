// Dev tool (not shipped, not in the SW shell): rasterizes ICONS.stretch from
// js/icons.js into the PNGs the reminder notification needs — Chrome/Android
// won't decode SVG for notification icons/badges — using nothing but Node
// (zlib). No image tooling is available in the owner's environment.
//
//   node tools/gen-icons.mjs            → assets/icons/notify-192.png, badge-96.png
//   node tools/gen-icons.mjs --preview  → also tools/icons-preview.png (every icon, for a look)
//
// Supports the path commands the icons use (M/m L/l H/h V/v C/c Z/z); curves
// are flattened, strokes are distance-to-segment with round caps, 3×3 supersampling.
import zlib from 'node:zlib';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ICONS } = await import(pathToFileURL(path.join(ROOT, 'js', 'icons.js')).href);

// ---- PNG encoder --------------------------------------------------------------
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function png({ w, h, data }) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < w * 4; x++) raw[y * (w * 4 + 1) + 1 + x] = Math.round(Math.min(255, Math.max(0, data[y * w * 4 + x])));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Image ----------------------------------------------------------------------
function image(w, h, fill = [0, 0, 0, 0]) {
  const data = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(fill, i * 4);
  return { w, h, data };
}
function blend(img, x, y, rgb, a) {
  if (a <= 0 || x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 4;
  const da = img.data[i + 3] / 255;
  const oa = a + da * (1 - a);
  for (let k = 0; k < 3; k++) img.data[i + k] = oa ? (rgb[k] * a + img.data[i + k] * da * (1 - a)) / oa : 0;
  img.data[i + 3] = oa * 255;
}

// ---- SVG path → polylines ---------------------------------------------------------
function parsePath(d) {
  const tokens = d.match(/[MmLlHhVvCcZz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) || [];
  let i = 0, cmd = null, cur = [0, 0], start = [0, 0], poly = null;
  const polys = [];
  const num = () => parseFloat(tokens[i++]);
  const moveTo = (p) => { poly = [p]; polys.push(poly); start = p; cur = p; };
  const lineTo = (p) => { poly.push(p); cur = p; };
  const cubic = (c1, c2, p) => {
    const o = cur;
    for (let k = 1; k <= 14; k++) {
      const t = k / 14, mt = 1 - t;
      poly.push([
        mt * mt * mt * o[0] + 3 * mt * mt * t * c1[0] + 3 * mt * t * t * c2[0] + t * t * t * p[0],
        mt * mt * mt * o[1] + 3 * mt * mt * t * c1[1] + 3 * mt * t * t * c2[1] + t * t * t * p[1],
      ]);
    }
    cur = p;
  };
  while (i < tokens.length) {
    const tk = tokens[i];
    if (/^[A-Za-z]$/.test(tk)) {
      cmd = tk; i++;
      if (cmd === 'Z' || cmd === 'z') { poly.push(start); cur = start; continue; }
    }
    switch (cmd) {
      case 'M': moveTo([num(), num()]); cmd = 'L'; break;
      case 'm': moveTo([cur[0] + num(), cur[1] + num()]); cmd = 'l'; break;
      case 'L': lineTo([num(), num()]); break;
      case 'l': { const dx = num(), dy = num(); lineTo([cur[0] + dx, cur[1] + dy]); break; }
      case 'H': lineTo([num(), cur[1]]); break;
      case 'h': lineTo([cur[0] + num(), cur[1]]); break;
      case 'V': lineTo([cur[0], num()]); break;
      case 'v': lineTo([cur[0], cur[1] + num()]); break;
      case 'C': { const c1 = [num(), num()], c2 = [num(), num()], p = [num(), num()]; cubic(c1, c2, p); break; }
      case 'c': {
        const o = cur;
        const c1 = [o[0] + num(), o[1] + num()], c2 = [o[0] + num(), o[1] + num()], p = [o[0] + num(), o[1] + num()];
        cubic(c1, c2, p); break;
      }
      default: throw new Error(`unsupported path command ${cmd} in ${d}`);
    }
  }
  return polys;
}
function iconSegments(svg) {
  const segs = [];
  for (const m of svg.matchAll(/<path d="([^"]+)"/g)) {
    for (const poly of parsePath(m[1])) {
      for (let k = 1; k < poly.length; k++) segs.push([poly[k - 1][0], poly[k - 1][1], poly[k][0], poly[k][1]]);
    }
  }
  return segs;
}
function segDist(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1, dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  const t = Math.max(0, Math.min(1, l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0));
  const ex = x1 + t * dx - px, ey = y1 + t * dy - py;
  return Math.sqrt(ex * ex + ey * ey);
}

// Draw a 24-unit icon into img at (ox, oy) with `size` px; stroke in icon units.
function drawIcon(img, svg, { x: ox, y: oy, size, rgb, stroke = 1.8 }) {
  const scale = size / 24;
  const segs = iconSegments(svg).map((s) => s.map((v, i) => (i % 2 === 0 ? ox + v * scale : oy + v * scale)));
  const half = (stroke * scale) / 2;
  const SS = 3;
  const x0 = Math.max(0, Math.floor(ox - half)), y0 = Math.max(0, Math.floor(oy - half));
  const x1 = Math.min(img.w - 1, Math.ceil(ox + size + half)), y1 = Math.min(img.h - 1, Math.ceil(oy + size + half));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      let hit = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS, py = y + (sy + 0.5) / SS;
          for (const s of segs) { if (segDist(px, py, s) <= half) { hit++; break; } }
        }
      }
      if (hit) blend(img, x, y, rgb, hit / (SS * SS));
    }
  }
}

const PAPER = [250, 247, 240], INK = [33, 30, 26], WHITE = [255, 255, 255];
const out = (f) => path.join(ROOT, 'assets', 'icons', f);

// Notification icon: paper square + ink stretch figure (bold stroke reads at 48dp).
{
  const img = image(192, 192, [...PAPER, 255]);
  drawIcon(img, ICONS.stretch, { x: 22, y: 22, size: 148, rgb: INK, stroke: 2.1 });
  writeFileSync(out('notify-192.png'), png(img));
}
// Status-bar badge: white silhouette on transparent (Android uses the alpha only).
{
  const img = image(96, 96);
  drawIcon(img, ICONS.stretch, { x: 6, y: 6, size: 84, rgb: WHITE, stroke: 2.6 });
  writeFileSync(out('badge-96.png'), png(img));
}
console.log('wrote assets/icons/notify-192.png + badge-96.png');

if (process.argv.includes('--preview')) {
  const keys = Object.keys(ICONS);
  const cell = 104, cols = 5, rows = Math.ceil(keys.length / cols);
  const img = image(cols * cell, rows * cell, [...PAPER, 255]);
  keys.forEach((k, i) => {
    const cx = (i % cols) * cell, cy = Math.floor(i / cols) * cell;
    for (let x = cx; x < cx + cell; x++) blend(img, x, cy, INK, 0.25);
    for (let y = cy; y < cy + cell; y++) blend(img, cx, y, INK, 0.25);
    drawIcon(img, ICONS[k], { x: cx + 16, y: cy + 16, size: 72, rgb: INK });
  });
  writeFileSync(path.join(ROOT, 'tools', 'icons-preview.png'), png(img));
  console.log('preview (row-major, 5 per row):', keys.join(', '), '→ tools/icons-preview.png');
}
