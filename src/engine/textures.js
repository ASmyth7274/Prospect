// Procedurally generated textures (no image assets needed).
import * as THREE from 'three/webgpu';
import { Simplex2 } from '../world/noise.js';

function tileableNoise(size, scale, octaves, seed) {
  // Tileable fbm via 4D-torus trick approximated with 2D noise blended across edges.
  const n = new Simplex2(seed);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // blend 4 samples so edges wrap
      const f = (sx, sy) => n.fbm(sx * scale, sy * scale, octaves);
      const a = f(u, v);
      const b = f(u - 1, v);
      const c = f(u, v - 1);
      const d = f(u - 1, v - 1);
      const val = a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
      out[y * size + x] = val;
    }
  }
  return out;
}

export function makeDetailTexture(size = 256) {
  const n1 = tileableNoise(size, 8, 4, 11);
  const n2 = tileableNoise(size, 32, 2, 12);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const v = 0.5 + n1[i] * 0.35 + n2[i] * 0.25;
    const g = Math.max(0, Math.min(255, v * 255));
    // R: macro noise, G: fine grain, B: speckle
    data[i * 4] = g;
    data[i * 4 + 1] = Math.max(0, Math.min(255, (0.5 + n2[i] * 0.6) * 255));
    data[i * 4 + 2] = n2[i] > 0.35 ? 255 : 0;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

export function makeWaterNormalTexture(size = 256) {
  const h = tileableNoise(size, 6, 4, 21);
  const h2 = tileableNoise(size, 14, 2, 22);
  const data = new Uint8Array(size * size * 4);
  const H = (x, y) => {
    x = (x + size) % size;
    y = (y + size) % size;
    const i = y * size + x;
    return h[i] + h2[i] * 0.35;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * 3.5;
      const dy = (H(x, y + 1) - H(x, y - 1)) * 3.5;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      data[i + 3] = (h[y * size + x] * 0.5 + 0.5) * 255; // height in alpha (foam mask)
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// Face atlas for blocky avatars: 4 expressions in a 2x2 grid. Non-front faces of the head map
// to the white corner so instance colour shows through as skin.
export function makeFaceTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  const cell = S / 2;
  const faces = [
    (x, y) => {
      // classic smile
      g.fillStyle = '#1b1b1b';
      g.beginPath();
      g.ellipse(x + 40, y + 52, 9, 13, 0, 0, Math.PI * 2);
      g.ellipse(x + 88, y + 52, 9, 13, 0, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 7;
      g.strokeStyle = '#1b1b1b';
      g.beginPath();
      g.arc(x + 64, y + 72, 26, 0.15 * Math.PI, 0.85 * Math.PI);
      g.stroke();
    },
    (x, y) => {
      // grin with teeth
      g.fillStyle = '#1b1b1b';
      g.fillRect(x + 32, y + 40, 14, 18);
      g.fillRect(x + 82, y + 40, 14, 18);
      g.beginPath();
      g.moveTo(x + 34, y + 76);
      g.quadraticCurveTo(x + 64, y + 112, x + 94, y + 76);
      g.closePath();
      g.fill();
      g.fillStyle = '#ffffff';
      g.fillRect(x + 42, y + 78, 44, 8);
    },
    (x, y) => {
      // determined
      g.strokeStyle = '#1b1b1b';
      g.lineWidth = 6;
      g.beginPath();
      g.moveTo(x + 28, y + 36);
      g.lineTo(x + 52, y + 44);
      g.moveTo(x + 100, y + 36);
      g.lineTo(x + 76, y + 44);
      g.stroke();
      g.fillStyle = '#1b1b1b';
      g.beginPath();
      g.arc(x + 42, y + 56, 8, 0, Math.PI * 2);
      g.arc(x + 86, y + 56, 8, 0, Math.PI * 2);
      g.fill();
      g.fillRect(x + 46, y + 86, 36, 6);
    },
    (x, y) => {
      // happy closed eyes
      g.strokeStyle = '#1b1b1b';
      g.lineWidth = 6;
      g.beginPath();
      g.arc(x + 42, y + 58, 11, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
      g.beginPath();
      g.arc(x + 86, y + 58, 11, Math.PI * 1.1, Math.PI * 1.9);
      g.stroke();
      g.fillStyle = '#1b1b1b';
      g.beginPath();
      g.arc(x + 64, y + 78, 20, 0, Math.PI);
      g.fill();
      g.fillStyle = '#ff7b8a';
      g.beginPath();
      g.arc(x + 64, y + 90, 9, 0, Math.PI);
      g.fill();
    },
  ];
  faces.forEach((f, i) => f((i % 2) * cell, Math.floor(i / 2) * cell));
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}

// Text sprite texture (signs)
export function makeSignTexture(lines, opts = {}) {
  const w = opts.w || 512;
  const h = opts.h || 256;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = opts.bg || '#6b4423';
  g.fillRect(0, 0, w, h);
  // wood grain
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(0,0,0,${0.04 + Math.random() * 0.05})`;
    g.fillRect(0, (i / 18) * h, w, 2 + Math.random() * 4);
  }
  g.strokeStyle = opts.border || '#3d2410';
  g.lineWidth = 14;
  g.strokeRect(7, 7, w - 14, h - 14);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lh = h / (lines.length + 1);
  lines.forEach((line, i) => {
    const size = i === 0 ? opts.titleSize || 64 : opts.size || 40;
    g.font = `900 ${size}px ui-rounded, "SF Pro Rounded", system-ui, sans-serif`;
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(0,0,0,0.6)';
    g.strokeText(line, w / 2, lh * (i + 1));
    g.fillStyle = i === 0 ? opts.color || '#ffd23f' : '#fff7e0';
    g.fillText(line, w / 2, lh * (i + 1));
  });
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  return tex;
}
