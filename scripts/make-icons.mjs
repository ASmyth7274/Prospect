// Generates the PWA icons (PNG) procedurally with signed-distance shapes. No dependencies.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('public/icons');
fs.mkdirSync(OUT, { recursive: true });

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const sdEllipse = (x, y, cx, cy, rx, ry) => (Math.hypot((x - cx) / rx, (y - cy) / ry) - 1) * Math.min(rx, ry);

// returns color for normalized coords u,v in [0,1]; pad shrinks art for maskable icons
function shade(u, v, pad, rounded) {
  const x = (u - 0.5) / pad + 0.5,
    y = (v - 0.5) / pad + 0.5;
  // background
  const r = Math.hypot(u - 0.5, v - 0.42);
  let col = mix(hex('#4f8fe0'), hex('#13224a'), clamp(r * 1.5, 0, 1));
  // sun rays
  const ang = Math.atan2(v - 0.42, u - 0.5);
  if (Math.sin(ang * 12) > 0.6) col = mix(col, hex('#ffffff'), 0.07 * (1 - clamp(r * 1.6, 0, 1)));
  // pan rim + body (ellipse)
  const rim = sdEllipse(x, y, 0.5, 0.6, 0.36, 0.17);
  const body = sdEllipse(x, y, 0.5, 0.585, 0.29, 0.12);
  if (rim < 0) col = mix(hex('#7a4f2a'), hex('#4a2e17'), clamp((y - 0.5) * 4, 0, 1));
  if (body < 0) col = mix(hex('#d8a066'), hex('#8a5a3a'), clamp((y - 0.5) * 5, 0, 1));
  // handle
  if (x > 0.83 && x < 0.97 && Math.abs(y - 0.58) < 0.03) col = hex('#4a2e17');
  // nuggets
  const nuggets = [
    [0.42, 0.56, 0.06],
    [0.53, 0.6, 0.075],
    [0.62, 0.55, 0.05],
    [0.48, 0.5, 0.045],
  ];
  for (const [nx, ny, nr] of nuggets) {
    const d = Math.hypot((x - nx) * 1, (y - ny) * 1.25) - nr;
    if (d < 0) {
      const hl = clamp(1 - Math.hypot(x - (nx - nr * 0.35), y - (ny - nr * 0.4)) / nr, 0, 1);
      col = mix(hex('#c98a12'), hex('#fff1a0'), hl * 0.9 + 0.1);
    }
  }
  // sparkles
  const sp = [
    [0.3, 0.3, 0.05],
    [0.72, 0.26, 0.07],
    [0.66, 0.4, 0.035],
  ];
  for (const [sx, sy, s] of sp) {
    const dx = Math.abs(x - sx),
      dy = Math.abs(y - sy);
    if (dx * dy < s * s * 0.012 && dx < s && dy < s) col = hex('#ffffff');
  }
  let a = 255;
  if (rounded) {
    // rounded square mask
    const q = 0.22;
    const ex = Math.max(Math.abs(u - 0.5) - (0.5 - q), 0),
      ey = Math.max(Math.abs(v - 0.5) - (0.5 - q), 0);
    if (Math.hypot(ex, ey) > q) a = 0;
  }
  return [...col, a];
}

function make(size, file, pad = 1, rounded = false) {
  const img = new Uint8Array(size * size * 4);
  const ss = 3;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let acc = [0, 0, 0, 0];
      for (let sy = 0; sy < ss; sy++)
        for (let sx = 0; sx < ss; sx++) {
          const c = shade((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, pad, rounded);
          acc = acc.map((v, i) => v + c[i]);
        }
      const k = (py * size + px) * 4;
      for (let i = 0; i < 4; i++) img[k + i] = acc[i] / (ss * ss);
    }
  }
  fs.writeFileSync(path.join(OUT, file), png(size, size, img));
  console.log('wrote', file);
}

make(192, 'icon-192.png', 1, true);
make(512, 'icon-512.png', 1, true);
make(512, 'icon-maskable-512.png', 0.78, false);
make(180, 'apple-touch-icon.png', 1, false);
