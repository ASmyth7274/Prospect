// Procedural 2D icons for minerals and items (canvas -> cached data URLs).
import { MINERAL_BY_ID, TIERS, GEODES } from '../data/minerals.js';

const cache = new Map();
const S = 96;

function canvas() {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return c;
}

function seeded(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  if (f > 0) {
    r += (255 - r) * f;
    g += (255 - g) * f;
    b += (255 - b) * f;
  } else {
    r *= 1 + f;
    g *= 1 + f;
    b *= 1 + f;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function poly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

function drawShape(g, m, rnd) {
  const [c1, c2] = m.colors;
  const cx = S / 2,
    cy = S / 2 + 4;
  g.lineJoin = 'round';
  g.lineWidth = 3;
  g.strokeStyle = 'rgba(0,0,0,.55)';
  switch (m.shape) {
    case 'nugget': {
      const pts = [];
      const n = 9;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const r = 26 + rnd() * 10;
        pts.push([cx + Math.cos(a) * r * 1.1, cy + Math.sin(a) * r * 0.85]);
      }
      const grad = g.createRadialGradient(cx - 10, cy - 12, 4, cx, cy, 40);
      grad.addColorStop(0, shade(c1, 0.45));
      grad.addColorStop(0.5, c1);
      grad.addColorStop(1, c2);
      g.fillStyle = grad;
      poly(g, pts);
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(0,0,0,.18)';
      for (let i = 0; i < 6; i++) {
        g.beginPath();
        g.arc(cx + (rnd() - 0.5) * 36, cy + (rnd() - 0.5) * 28, 2 + rnd() * 3, 0, 7);
        g.fill();
      }
      break;
    }
    case 'crystal': {
      const shards = 3;
      for (let k = shards - 1; k >= 0; k--) {
        const off = (k - 1) * 16;
        const h = 58 - Math.abs(k - 1) * 14;
        const w = 13;
        const bx = cx + off,
          by = cy + 28;
        const pts = [
          [bx - w, by],
          [bx - w, by - h * 0.7],
          [bx, by - h],
          [bx + w, by - h * 0.7],
          [bx + w, by],
        ];
        const grad = g.createLinearGradient(bx - w, 0, bx + w, 0);
        grad.addColorStop(0, shade(c1, 0.35));
        grad.addColorStop(0.5, c1);
        grad.addColorStop(1, c2);
        g.fillStyle = grad;
        poly(g, pts);
        g.fill();
        g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.4)';
        g.beginPath();
        g.moveTo(bx, by - h);
        g.lineTo(bx, by);
        g.stroke();
        g.strokeStyle = 'rgba(0,0,0,.55)';
      }
      break;
    }
    case 'gem': {
      const w = 34,
        top = cy - 18,
        mid = cy - 6,
        bot = cy + 30;
      const outer = [
        [cx - w * 0.6, top],
        [cx + w * 0.6, top],
        [cx + w, mid],
        [cx, bot],
        [cx - w, mid],
      ];
      g.fillStyle = c2;
      poly(g, outer);
      g.fill();
      g.stroke();
      g.fillStyle = shade(c1, 0.4);
      poly(g, [
        [cx - w * 0.6, top],
        [cx + w * 0.6, top],
        [cx + w * 0.3, mid],
        [cx - w * 0.3, mid],
      ]);
      g.fill();
      g.fillStyle = c1;
      poly(g, [
        [cx - w * 0.3, mid],
        [cx + w * 0.3, mid],
        [cx, bot],
      ]);
      g.fill();
      g.fillStyle = shade(c2, -0.2);
      poly(g, [
        [cx + w * 0.3, mid],
        [cx + w, mid],
        [cx, bot],
      ]);
      g.fill();
      poly(g, outer);
      g.stroke();
      break;
    }
    case 'shell': {
      const grad = g.createRadialGradient(cx, cy + 20, 4, cx, cy, 40);
      grad.addColorStop(0, c2);
      grad.addColorStop(1, c1);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(cx, cy + 26);
      g.bezierCurveTo(cx - 52, cy + 6, cx - 30, cy - 36, cx, cy - 30);
      g.bezierCurveTo(cx + 30, cy - 36, cx + 52, cy + 6, cx, cy + 26);
      g.fill();
      g.stroke();
      g.strokeStyle = shade(c2, -0.25);
      g.lineWidth = 2;
      for (let i = -3; i <= 3; i++) {
        g.beginPath();
        g.moveTo(cx, cy + 24);
        g.lineTo(cx + i * 10, cy - 26 + Math.abs(i) * 6);
        g.stroke();
      }
      break;
    }
    case 'sphere':
    case 'orb': {
      const r = m.shape === 'orb' ? 27 : 24;
      const grad = g.createRadialGradient(cx - 9, cy - 12, 3, cx, cy, r + 4);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.25, shade(c1, 0.3));
      grad.addColorStop(0.7, c1);
      grad.addColorStop(1, c2);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, r, 0, 7);
      g.fill();
      g.stroke();
      if (m.shape === 'orb') {
        g.strokeStyle = 'rgba(255,255,255,.45)';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(cx, cy, r - 7, 0.4, 2.2);
        g.stroke();
      } else {
        g.strokeStyle = shade(c2, -0.2);
        g.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
          g.beginPath();
          g.ellipse(cx, cy, r - 2, 6 + i * 6, 0.3, 0, 7);
          g.stroke();
        }
      }
      break;
    }
    case 'coin': {
      g.fillStyle = c2;
      g.beginPath();
      g.ellipse(cx, cy + 4, 30, 26, 0, 0, 7);
      g.fill();
      g.stroke();
      g.fillStyle = c1;
      g.beginPath();
      g.ellipse(cx, cy, 30, 26, 0, 0, 7);
      g.fill();
      g.stroke();
      g.strokeStyle = shade(c2, -0.1);
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(cx, cy, 21, 18, 0, 0, 7);
      g.stroke();
      g.fillStyle = shade(c2, -0.1);
      g.font = '900 22px system-ui';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(m.id === 'scarab' ? '◆' : '♛', cx, cy + 1);
      break;
    }
    case 'bone': {
      g.fillStyle = c1;
      g.save();
      g.translate(cx, cy);
      g.rotate(-0.6);
      g.fillRect(-26, -7, 52, 14);
      g.strokeRect(-26, -7, 52, 14);
      for (const sx of [-1, 1])
        for (const sy of [-1, 1]) {
          g.beginPath();
          g.arc(sx * 28, sy * 8, 10, 0, 7);
          g.fill();
          g.stroke();
        }
      g.restore();
      break;
    }
    case 'skull': {
      g.fillStyle = c1;
      g.beginPath();
      g.ellipse(cx, cy - 6, 30, 24, 0, 0, 7);
      g.fill();
      g.stroke();
      g.fillRect(cx - 18, cy + 10, 36, 16);
      g.strokeRect(cx - 18, cy + 10, 36, 16);
      g.fillStyle = '#2a2018';
      g.beginPath();
      g.ellipse(cx - 12, cy - 6, 7, 9, 0, 0, 7);
      g.ellipse(cx + 12, cy - 6, 7, 9, 0, 0, 7);
      g.fill();
      g.fillStyle = '#fff';
      for (let i = 0; i < 5; i++) g.fillRect(cx - 15 + i * 6.5, cy + 12, 4, 8);
      break;
    }
    case 'shard': {
      const pts = [
        [cx - 8, cy - 34],
        [cx + 22, cy - 6],
        [cx + 10, cy + 30],
        [cx - 20, cy + 18],
        [cx - 26, cy - 8],
      ];
      const grad = g.createLinearGradient(cx - 26, cy - 34, cx + 22, cy + 30);
      grad.addColorStop(0, shade(c1, 0.4));
      grad.addColorStop(0.5, c1);
      grad.addColorStop(1, c2);
      g.fillStyle = grad;
      poly(g, pts);
      g.fill();
      g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.35)';
      g.beginPath();
      g.moveTo(cx - 8, cy - 34);
      g.lineTo(cx - 2, cy + 6);
      g.lineTo(cx + 10, cy + 30);
      g.stroke();
      break;
    }
    case 'branch': {
      g.strokeStyle = c2;
      g.lineCap = 'round';
      g.lineWidth = 9;
      const br = (x, y, a, len, d) => {
        if (d > 3) return;
        const x2 = x + Math.cos(a) * len,
          y2 = y + Math.sin(a) * len;
        g.strokeStyle = d % 2 ? c1 : c2;
        g.lineWidth = 9 - d * 2;
        g.beginPath();
        g.moveTo(x, y);
        g.lineTo(x2, y2);
        g.stroke();
        br(x2, y2, a - 0.5, len * 0.7, d + 1);
        br(x2, y2, a + 0.5, len * 0.7, d + 1);
      };
      br(cx, cy + 32, -Math.PI / 2, 24, 0);
      break;
    }
    default:
      g.fillStyle = c1;
      g.fillRect(cx - 20, cy - 20, 40, 40);
  }
}

export function mineralIcon(id, mods = []) {
  const key = id + '|' + mods.join(',');
  if (cache.has(key)) return cache.get(key);
  const m = MINERAL_BY_ID[id];
  const c = canvas();
  const g = c.getContext('2d');
  const tier = TIERS[m.tier];
  // tier glow
  if (m.tier >= 2 || mods.length) {
    const grad = g.createRadialGradient(S / 2, S / 2, 6, S / 2, S / 2, S / 2);
    const col = mods.includes('voidtorn') ? '#c77dff' : tier.glow;
    grad.addColorStop(0, col + '88');
    grad.addColorStop(1, col + '00');
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);
  }
  drawShape(g, m, seeded(id));
  // modifier overlays
  const rnd = seeded(id + mods.join());
  if (mods.includes('shiny') || mods.includes('iridescent') || m.glow) {
    g.fillStyle = '#fff';
    for (let i = 0; i < 4; i++) {
      const x = 20 + rnd() * 56,
        y = 20 + rnd() * 50,
        s = 3 + rnd() * 4;
      g.beginPath();
      g.moveTo(x, y - s * 2);
      g.lineTo(x + s * 0.5, y - s * 0.5);
      g.lineTo(x + s * 2, y);
      g.lineTo(x + s * 0.5, y + s * 0.5);
      g.lineTo(x, y + s * 2);
      g.lineTo(x - s * 0.5, y + s * 0.5);
      g.lineTo(x - s * 2, y);
      g.lineTo(x - s * 0.5, y - s * 0.5);
      g.fill();
    }
  }
  if (mods.includes('scorching')) {
    g.fillStyle = 'rgba(255,90,20,.35)';
    g.fillRect(0, S * 0.6, S, S * 0.4);
  }
  if (mods.includes('electrified')) {
    g.strokeStyle = '#7ad7ff';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(18, 14);
    g.lineTo(30, 30);
    g.lineTo(22, 34);
    g.lineTo(36, 52);
    g.stroke();
  }
  if (mods.includes('irradiated')) {
    g.fillStyle = 'rgba(157,255,60,.25)';
    g.beginPath();
    g.arc(S / 2, S / 2, 40, 0, 7);
    g.fill();
  }
  if (mods.includes('frosted')) {
    g.fillStyle = 'rgba(220,245,255,.45)';
    g.fillRect(0, 0, S, S * 0.3);
  }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function emojiIcon(emoji, bg = '#2a3350', fg) {
  const key = 'e|' + emoji + bg;
  if (cache.has(key)) return cache.get(key);
  const c = canvas();
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(6, 6, S - 12, S - 12, 18);
  g.fill();
  g.font = '56px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, S / 2, S / 2 + 4);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function panIcon(pan) {
  const key = 'pan|' + pan.id;
  if (cache.has(key)) return cache.get(key);
  const c = canvas();
  const g = c.getContext('2d');
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(0,0,0,.5)';
  g.fillStyle = pan.rim;
  g.beginPath();
  g.ellipse(48, 52, 40, 22, 0, 0, 7);
  g.fill();
  g.stroke();
  const grad = g.createRadialGradient(40, 44, 4, 48, 52, 34);
  grad.addColorStop(0, shade(pan.color, 0.4));
  grad.addColorStop(1, pan.color);
  g.fillStyle = grad;
  g.beginPath();
  g.ellipse(48, 50, 32, 16, 0, 0, 7);
  g.fill();
  g.fillStyle = 'rgba(255,215,60,.9)';
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(38 + i * 7, 50 + (i % 2) * 4, 3, 0, 7);
    g.fill();
  }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function shovelIcon(sh) {
  const key = 'sh|' + sh.id;
  if (cache.has(key)) return cache.get(key);
  const c = canvas();
  const g = c.getContext('2d');
  g.save();
  g.translate(48, 48);
  g.rotate(-0.75);
  g.fillStyle = '#7a5230';
  g.strokeStyle = 'rgba(0,0,0,.5)';
  g.lineWidth = 3;
  g.fillRect(-4, -42, 8, 52);
  g.strokeRect(-4, -42, 8, 52);
  g.fillRect(-12, -46, 24, 7);
  const grad = g.createLinearGradient(-16, 0, 16, 0);
  grad.addColorStop(0, shade(sh.color, 0.35));
  grad.addColorStop(1, sh.color);
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(-15, 8);
  g.lineTo(15, 8);
  g.lineTo(13, 34);
  g.lineTo(0, 44);
  g.lineTo(-13, 34);
  g.closePath();
  g.fill();
  g.stroke();
  g.restore();
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function geodeIcon(geo) {
  const key = 'geo|' + geo.id;
  if (cache.has(key)) return cache.get(key);
  const c = canvas();
  const g = c.getContext('2d');
  g.fillStyle = geo.color;
  g.strokeStyle = 'rgba(0,0,0,.5)';
  g.lineWidth = 3;
  g.beginPath();
  g.arc(48, 50, 32, 0, 7);
  g.fill();
  g.stroke();
  g.fillStyle = 'rgba(0,0,0,.18)';
  for (let i = 0; i < 7; i++) {
    g.beginPath();
    g.arc(30 + ((i * 37) % 40), 32 + ((i * 23) % 36), 4, 0, 7);
    g.fill();
  }
  g.fillStyle = '#b46bff';
  g.beginPath();
  g.moveTo(48, 28);
  g.lineTo(60, 50);
  g.lineTo(48, 72);
  g.lineTo(36, 50);
  g.fill();
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export function ringIcon(r) {
  const key = 'ring|' + r.id;
  if (cache.has(key)) return cache.get(key);
  const c = canvas();
  const g = c.getContext('2d');
  g.lineWidth = 9;
  g.strokeStyle = r.color;
  g.beginPath();
  g.ellipse(48, 56, 26, 22, 0, 0, 7);
  g.stroke();
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(0,0,0,.4)';
  g.beginPath();
  g.ellipse(48, 56, 31, 27, 0, 0, 7);
  g.stroke();
  g.fillStyle = r.gem;
  g.strokeStyle = 'rgba(0,0,0,.5)';
  g.beginPath();
  g.moveTo(48, 18);
  g.lineTo(62, 32);
  g.lineTo(48, 46);
  g.lineTo(34, 32);
  g.closePath();
  g.fill();
  g.stroke();
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

export { GEODES };
