// Procedural heightmap + water map built from the hand-authored layout.
// Pure JS: runs in the browser (chunked, async) and in Node (map preview tooling).

import { Simplex2, clamp, lerp, smoothstep } from './noise.js';
import {
  WORLD_HALF,
  CELL,
  SEED,
  RIVERS,
  LAKES,
  LAVA_LAKES,
  PATHS,
  BIOMES,
  MAIN_ISLAND,
  CALDERA,
  CAVERN,
  AREAS,
  DIG_SITES,
  DECKS,
} from './layout.js';
import { SITES, GROUND_COLORS } from '../data/sites.js';

export const WATER_NONE = 0;
export const WATER_OCEAN = 1;
export const WATER_RIVER = 2;
export const WATER_LAKE = 3;
export const WATER_LAVA = 4;
export const WATER_HOT = 5;

const BIOME_COLORS = {
  meadow: [0.42, 0.66, 0.27],
  forest: [0.27, 0.52, 0.22],
  valley: [0.45, 0.64, 0.3],
  wetland: [0.36, 0.5, 0.24],
  beach: [0.93, 0.85, 0.62],
  cliffs: [0.5, 0.64, 0.34],
  desert: [0.93, 0.72, 0.45],
  mesa: [0.8, 0.5, 0.33],
  mountain: [0.52, 0.52, 0.54],
  snow: [0.93, 0.96, 1.0],
  volcano: [0.36, 0.31, 0.3],
};
const ROCK_COLORS = {
  meadow: [0.5, 0.48, 0.44],
  forest: [0.45, 0.43, 0.4],
  valley: [0.52, 0.5, 0.46],
  wetland: [0.38, 0.36, 0.3],
  beach: [0.62, 0.58, 0.52],
  cliffs: [0.58, 0.56, 0.54],
  desert: [0.76, 0.5, 0.32],
  mesa: [0.66, 0.36, 0.24],
  mountain: [0.44, 0.44, 0.47],
  snow: [0.62, 0.66, 0.72],
  volcano: [0.26, 0.23, 0.24],
};

// Polyline helpers ---------------------------------------------------------
function closestOnPolyline(pts, x, z) {
  let best = { d2: Infinity, t: 0, i: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1;
    let t = ((x - ax) * dx + (z - az) * dz) / len2;
    t = clamp(t, 0, 1);
    const px = ax + dx * t;
    const pz = az + dz * t;
    const d2 = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d2 < best.d2) best = { d2, t, i };
  }
  const a = pts[best.i];
  const b = pts[best.i + 1];
  return {
    d: Math.sqrt(best.d2),
    level: lerp(a[2], b[2], best.t),
    hw: lerp(a[3], b[3], best.t),
    dirx: b[0] - a[0],
    dirz: b[1] - a[1],
    i: best.i,
    t: best.t,
  };
}

function polyBounds(pts, pad) {
  let minx = Infinity,
    minz = Infinity,
    maxx = -Infinity,
    maxz = -Infinity;
  for (const p of pts) {
    minx = Math.min(minx, p[0]);
    maxx = Math.max(maxx, p[0]);
    minz = Math.min(minz, p[1]);
    maxz = Math.max(maxz, p[1]);
  }
  return { minx: minx - pad, maxx: maxx + pad, minz: minz - pad, maxz: maxz + pad };
}

export function capsuleDist(x, z, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((x - a[0]) * dx + (z - a[1]) * dz) / len2 : 0;
  t = clamp(t, 0, 1);
  const px = a[0] + dx * t - x;
  const pz = a[1] + dz * t - z;
  return Math.sqrt(px * px + pz * pz);
}


// Smooth a river polyline (Catmull-Rom) and add a gentle noise meander that tapers at the ends.
function meanderPolyline(pts, amp, noise, step = 8) {
  if (!amp) return pts;
  const out = [];
  const P = (i) => pts[Math.max(0, Math.min(pts.length - 1, i))];
  let along = 0;
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = P(i - 1),
      p1 = P(i),
      p2 = P(i + 1),
      p3 = P(i + 2);
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.round(segLen / step));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t,
        t3 = t2 * t;
      const cr = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      let x = cr(0),
        z = cr(1);
      const level = lerp(p1[2], p2[2], t);
      const hw = lerp(p1[3], p2[3], t);
      const dx = p2[0] - p1[0],
        dz = p2[1] - p1[1];
      const len = Math.hypot(dx, dz) || 1;
      const nx = -dz / len,
        nz = dx / len;
      const a = along + segLen * t;
      const taper = Math.min(1, a / 60, (total - a) / 60);
      const off = amp * taper * noise.fbm(a / 110, pts[0][0] * 0.01, 2);
      x += nx * off;
      z += nz * off;
      out.push([x, z, level, hw]);
    }
    along += segLen;
  }
  out.push(pts[pts.length - 1].slice());
  return out;
}

// --------------------------------------------------------------------------
export class WorldData {
  constructor() {
    this.half = WORLD_HALF;
    this.cell = CELL;
    this.n = Math.round((WORLD_HALF * 2) / CELL) + 1;
    const nn = this.n * this.n;
    this.heights = new Float32Array(nn);
    this.water = new Float32Array(nn).fill(-999);
    this.waterType = new Uint8Array(nn);
    this.biomeIdx = new Uint8Array(nn);
    this.noise = new Simplex2(SEED);
    this.noise2 = new Simplex2(SEED + 77);
    this.biomeTypes = Object.keys(BIOME_COLORS);
    this.rivers = RIVERS.map((r) => ({ ...r, pts: meanderPolyline(r.pts, r.meander || 0, this.noise2) }));
    this.riverById = Object.fromEntries(this.rivers.map((r) => [r.id, r]));
    this.decks = DECKS.map((d) => this._resolveDeck(d));
    this.flags = {}; // runtime gating flags (e.g. bridge repaired)
  }

  _resolveDeck(d) {
    let deck = { ...d };
    if (d.river) {
      const r = this.riverById[d.river];
      // find river point closest to z
      let best = null;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i],
          b = r.pts[i + 1];
        if ((a[1] - d.z) * (b[1] - d.z) <= 0) {
          const t = (d.z - a[1]) / (b[1] - a[1] || 1);
          best = { x: lerp(a[0], b[0], t), level: lerp(a[2], b[2], t), hw: lerp(a[3], b[3], t), dx: b[0] - a[0], dz: b[1] - a[1] };
          break;
        }
      }
      const len = Math.hypot(best.dx, best.dz) || 1;
      // deck runs perpendicular to flow: local X = (cos yaw, -sin yaw) = (-dz, dx)/len
      const ax = -best.dz / len,
        az = best.dx / len;
      deck = { ...deck, x: best.x, len: best.hw * 2 + 12, h: best.level + 2.2, yaw: Math.atan2(-az, ax) };
    }
    deck.cos = Math.cos(deck.yaw);
    deck.sin = Math.sin(deck.yaw);
    return deck;
  }

  // ---- raw terrain before water carving ----
  biomeHeight(type, x, z) {
    const N = this.noise;
    switch (type) {
      case 'meadow':
        return 7 + 4 * N.fbm(x / 180, z / 180, 4) + 1.2 * N.fbm(x / 40, z / 40, 2);
      case 'forest':
        return 12 + 8 * N.fbm(x / 160, z / 160, 4) + 2 * N.fbm(x / 35, z / 35, 2);
      case 'valley':
        return 15 + 6 * N.fbm(x / 170, z / 170, 4) + 1.5 * N.fbm(x / 45, z / 45, 2);
      case 'wetland':
        return 1.7 + 1.5 * N.fbm(x / 60, z / 60, 3);
      case 'beach':
        return 3 + 2.2 * N.fbm(x / 120, z / 120, 3);
      case 'cliffs':
        return 19 + 9 * N.fbm(x / 120, z / 120, 4) + 7 * N.ridged(x / 70, z / 70, 3);
      case 'desert': {
        const warp = 3 * N.fbm(x / 220, z / 220, 2);
        const dune = Math.sin((x * 0.75 + z * 0.66) / 17 + warp) * 0.5 + 0.5;
        return 13 + 5.5 * dune * dune * (0.6 + 0.4 * N.fbm(x / 90, z / 90, 2)) + 3 * N.fbm(x / 260, z / 260, 3);
      }
      case 'mesa': {
        const n = N.fbm(x / 85, z / 85, 3);
        const t = smoothstep(0.02, 0.14, n);
        return 15 + 20 * t + 1.5 * N.fbm(x / 30, z / 30, 2);
      }
      case 'mountain':
        return 38 + 72 * N.ridged(x / 230, z / 230, 5) + 9 * N.fbm(x / 60, z / 60, 3);
      case 'snow': {
        const d = Math.hypot(x - 0, z + 545);
        const cone = Math.pow(Math.max(0, 1 - d / 230), 1.25);
        return 55 + 105 * cone + 18 * N.ridged(x / 110, z / 110, 4);
      }
      default:
        return 8;
    }
  }

  rawHeight(x, z, out) {
    // Biome blend
    let wsum = 0.0001;
    let hsum = 0;
    let best = 0,
      bestW = -1;
    const weights = this._w || (this._w = new Float32Array(this.biomeTypes.length));
    weights.fill(0);
    for (const b of BIOMES) {
      const dx = x - b.x;
      const dz = z - b.z;
      const w = Math.exp(-(dx * dx + dz * dz) / (2 * b.s * b.s));
      if (w < 0.004) continue;
      wsum += w;
      hsum += w * this.biomeHeight(b.type, x, z);
      const ti = this.biomeTypes.indexOf(b.type);
      weights[ti] += w;
    }
    // background meadow
    const bg = 0.02;
    wsum += bg;
    hsum += bg * this.biomeHeight('meadow', x, z);
    weights[0] += bg;
    let h = hsum / wsum;
    for (let i = 0; i < weights.length; i++) {
      if (weights[i] > bestW) {
        bestW = weights[i];
        best = i;
      }
    }

    // Main island coast mask
    const mx = x - MAIN_ISLAND.x;
    const mz = z - MAIN_ISLAND.z;
    const md = Math.hypot(mx, mz);
    const ang = Math.atan2(mz, mx);
    const R =
      MAIN_ISLAND.r +
      60 * this.noise2.fbm(Math.cos(ang) * 1.6 + 10, Math.sin(ang) * 1.6 + 10, 3) +
      25 * this.noise2.noise(x / 90, z / 90);
    const coast = smoothstep(-30, 70, R - md);
    let land = lerp(-16 + 4 * this.noise2.noise(x / 200, z / 200), h, coast);
    if (coast < 0.999 && coast > 0.0) {
      // beaches: flatten near sea level
      const beachT = smoothstep(0.0, 0.35, coast) * (1 - smoothstep(0.35, 0.8, coast));
      land = lerp(land, Math.min(land, 1.4 + 1.5 * coast), beachT * 0.85);
    }

    // Caldera island
    const cx = x - CALDERA.x;
    const cz = z - CALDERA.z;
    const cd = Math.hypot(cx, cz);
    let volc = -999;
    if (cd < CALDERA.r + 120) {
      const rr = CALDERA.r + 18 * this.noise2.noise(cx / 60, cz / 60);
      if (cd > CALDERA.craterR) {
        const t = clamp((rr - cd) / (rr - CALDERA.craterR), -1, 1);
        volc = t > 0 ? CALDERA.peak * Math.pow(t, 1.45) : -16 * Math.min(1, -t * 2);
        volc += 3 * this.noise.ridged(x / 40, z / 40, 3) * clamp(t, 0, 1);
        if (t > 0 && t < 0.18) volc = lerp(1.2 + t * 10, volc, smoothstep(0.08, 0.18, t)); // beach ring
      } else {
        const t = cd / CALDERA.craterR;
        volc = CALDERA.craterFloor + (CALDERA.peak - CALDERA.craterFloor) * Math.pow(t, 5);
        volc += 0.8 * this.noise.noise(x / 12, z / 12);
      }
    }
    let finalH = land;
    let biome = best;
    if (volc > land) {
      finalH = volc;
      biome = this.biomeTypes.indexOf('volcano');
    }

    // Crystal Caverns basin
    const kd = Math.hypot(x - CAVERN.x, z - CAVERN.z);
    if (kd < CAVERN.r + 10) {
      const t = smoothstep(CAVERN.r - 22, CAVERN.r + 6, kd);
      const floor = CAVERN.floor + 0.6 * this.noise.noise(x / 14, z / 14) + 1.2 * smoothstep(CAVERN.r - 40, CAVERN.r - 20, kd);
      finalH = lerp(floor, Math.max(finalH, CAVERN.roof + 6), t);
    }

    if (out) out.biome = biome;
    return finalH;
  }

  _carveLine(pts, hw0, slope, depth, levee, waterType, isPath, side) {
    const pad = 70;
    const bb = polyBounds(pts, pad);
    const n = this.n;
    const i0 = Math.max(0, Math.floor((bb.minx + this.half) / this.cell));
    const i1 = Math.min(n - 1, Math.ceil((bb.maxx + this.half) / this.cell));
    const j0 = Math.max(0, Math.floor((bb.minz + this.half) / this.cell));
    const j1 = Math.min(n - 1, Math.ceil((bb.maxz + this.half) / this.cell));
    for (let j = j0; j <= j1; j++) {
      const z = j * this.cell - this.half;
      for (let i = i0; i <= i1; i++) {
        const x = i * this.cell - this.half;
        const c = closestOnPolyline(pts, x, z);
        const hw = c.hw;
        if (c.d > hw + pad) continue;
        const idx = j * n + i;
        let h = this.heights[idx];
        if (isPath) {
          // Flat-ish trail cut + fill
          const target = c.level;
          const bank = target + Math.max(0, c.d - hw) * slope;
          if (c.d < hw) h = side ? lerp(h, target, 0.9) : target;
          else if (h > bank) h = bank;
          else if (side && c.d < hw + 4) h = Math.max(h, lerp(target, h, (c.d - hw) / 4));
          this.heights[idx] = h;
          continue;
        }
        const W = c.level;
        if (c.d < hw) {
          const bed = W - depth * (1 - Math.pow(c.d / hw, 2)) - 0.15;
          h = Math.min(h, bed);
          this.heights[idx] = h;
          if (W > this.water[idx]) {
            this.water[idx] = W;
            this.waterType[idx] = waterType;
          }
        } else {
          const bank = W + 0.05 + (c.d - hw) * slope;
          h = Math.min(h, bank);
          if (levee && c.d < hw + 6 && W > 0.6 && this.heights[idx] > W - 1.0) {
            const lv = W + 0.3 * smoothstep(hw, hw + 1.5, c.d);
            h = Math.max(h, lerp(lv, h, smoothstep(hw + 2, hw + 6, c.d)));
          }
          this.heights[idx] = h;
        }
      }
    }
  }

  _carveLake(L, waterType) {
    const pad = 60;
    const n = this.n;
    const i0 = Math.max(0, Math.floor((L.x - L.r - pad + this.half) / this.cell));
    const i1 = Math.min(n - 1, Math.ceil((L.x + L.r + pad + this.half) / this.cell));
    const j0 = Math.max(0, Math.floor((L.z - L.r - pad + this.half) / this.cell));
    const j1 = Math.min(n - 1, Math.ceil((L.z + L.r + pad + this.half) / this.cell));
    const slope = L.slope ?? 0.5;
    const depth = L.depth ?? 2;
    for (let j = j0; j <= j1; j++) {
      const z = j * this.cell - this.half;
      for (let i = i0; i <= i1; i++) {
        const x = i * this.cell - this.half;
        const idx = j * n + i;
        const wob = 1 + 0.08 * this.noise.noise(x / 18 + L.x, z / 18);
        const d = Math.hypot(x - L.x, z - L.z) / wob;
        let h = this.heights[idx];
        if (d < L.r) {
          const bed = L.level - depth * (1 - Math.pow(d / L.r, 2)) - 0.15;
          h = Math.min(h, bed);
          if (L.level > this.water[idx]) {
            this.water[idx] = L.level;
            this.waterType[idx] = waterType;
          }
        } else {
          h = Math.min(h, L.level + 0.05 + (d - L.r) * slope);
          if (d < L.r + 6) {
            const lv = L.level + 0.3 * smoothstep(L.r, L.r + 1.5, d);
            h = Math.max(h, lerp(lv, h, smoothstep(L.r + 2, L.r + 6, d)));
          }
        }
        this.heights[idx] = h;
      }
    }
  }

  // Generate everything. onProgress(0..1). Async to keep the UI alive.
  async generate(onProgress = () => {}) {
    const n = this.n;
    const tmp = {};
    const yieldEvery = 24;
    for (let j = 0; j < n; j++) {
      const z = j * this.cell - this.half;
      for (let i = 0; i < n; i++) {
        const x = i * this.cell - this.half;
        const idx = j * n + i;
        this.heights[idx] = this.rawHeight(x, z, tmp);
        this.biomeIdx[idx] = tmp.biome;
      }
      if (j % yieldEvery === 0) {
        onProgress((j / n) * 0.8);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    // Paths first (trails), then rivers + lakes carve over them
    for (const p of PATHS) this._carveLine(p.pts, 0, p.slope, 0, false, WATER_NONE, true, p.side);
    onProgress(0.84);
    await new Promise((r) => setTimeout(r, 0));
    for (const r of this.rivers) {
      this._carveLine(r.pts, 0, r.slope, r.depth, true, r.lava ? WATER_LAVA : WATER_RIVER, false);
    }
    onProgress(0.92);
    await new Promise((r) => setTimeout(r, 0));
    for (const L of LAKES) this._carveLake(L, L.hot ? WATER_HOT : WATER_LAKE);
    for (const L of LAVA_LAKES) this._carveLake({ ...L, slope: 1.0, depth: 1.5 }, WATER_LAVA);
    // Ocean
    for (let k = 0; k < n * n; k++) {
      if (this.heights[k] < 0 && this.water[k] < 0) {
        this.water[k] = 0;
        this.waterType[k] = WATER_OCEAN;
      }
    }
    // Light smoothing pass on land to soften carve seams
    this._smooth(1);
    onProgress(1);
  }

  async computeColors(onProgress = () => {}) {
    const n = this.n;
    this.colors = new Uint8Array(n * n * 3);
    const out = [0, 0, 0];
    const H = this.heights;
    const cell = this.cell;
    for (let j = 0; j < n; j++) {
      const z = j * cell - this.half;
      for (let i = 0; i < n; i++) {
        const x = i * cell - this.half;
        const k = j * n + i;
        const l1 = H[j * n + Math.max(0, i - 1)];
        const r1 = H[j * n + Math.min(n - 1, i + 1)];
        const d1 = H[Math.max(0, j - 1) * n + i];
        const u1 = H[Math.min(n - 1, j + 1) * n + i];
        const ny = (2 * cell) / Math.hypot(l1 - r1, 2 * cell, d1 - u1);
        this.colorAt(x, z, H[k], ny, out);
        this.colors[k * 3] = out[0] * 255;
        this.colors[k * 3 + 1] = out[1] * 255;
        this.colors[k * 3 + 2] = out[2] * 255;
      }
      if (j % 40 === 0) {
        onProgress(j / n);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    onProgress(1);
  }

  exportBuffers() {
    return { heights: this.heights, water: this.water, waterType: this.waterType, biomeIdx: this.biomeIdx, colors: this.colors };
  }

  importBuffers(b) {
    this.heights = b.heights;
    this.water = b.water;
    this.waterType = b.waterType;
    this.biomeIdx = b.biomeIdx;
    this.colors = b.colors;
  }

  _smooth(iterations) {
    const n = this.n;
    const h = this.heights;
    const out = new Float32Array(h.length);
    for (let it = 0; it < iterations; it++) {
      out.set(h);
      for (let j = 1; j < n - 1; j++) {
        for (let i = 1; i < n - 1; i++) {
          const k = j * n + i;
          if (this.water[k] > -900) continue; // keep beds crisp
          out[k] = h[k] * 0.5 + (h[k - 1] + h[k + 1] + h[k - n] + h[k + n]) * 0.125;
        }
      }
      h.set(out);
    }
  }

  // ---- queries ----
  heightAt(x, z) {
    const n = this.n;
    const fx = clamp((x + this.half) / this.cell, 0, n - 1.001);
    const fz = clamp((z + this.half) / this.cell, 0, n - 1.001);
    const i = fx | 0;
    const j = fz | 0;
    const tx = fx - i;
    const tz = fz - j;
    const k = j * n + i;
    const h = this.heights;
    // triangle-consistent interpolation matching the mesh split (diagonal from (i,j+1) to (i+1,j))
    if (tx + tz < 1) {
      return h[k] + (h[k + 1] - h[k]) * tx + (h[k + n] - h[k]) * tz;
    }
    return h[k + n + 1] + (h[k + n] - h[k + n + 1]) * (1 - tx) + (h[k + 1] - h[k + n + 1]) * (1 - tz);
  }

  normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
    const e = this.cell;
    const hl = this.heightAt(x - e, z);
    const hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e);
    const hu = this.heightAt(x, z + e);
    let nx = hl - hr;
    let ny = 2 * e;
    let nz = hd - hu;
    const len = Math.hypot(nx, ny, nz);
    out.x = nx / len;
    out.y = ny / len;
    out.z = nz / len;
    return out;
  }

  // Water surface at (x,z) or -999. Uses the max of the 4 surrounding cells to avoid gaps.
  waterAt(x, z) {
    const n = this.n;
    const fx = clamp((x + this.half) / this.cell, 0, n - 1.001);
    const fz = clamp((z + this.half) / this.cell, 0, n - 1.001);
    const i = Math.round(fx);
    const j = Math.round(fz);
    const k = clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1);
    return this.water[k];
  }

  waterTypeAt(x, z) {
    const n = this.n;
    const i = clamp(Math.round((x + this.half) / this.cell), 0, n - 1);
    const j = clamp(Math.round((z + this.half) / this.cell), 0, n - 1);
    return this.waterType[j * n + i];
  }

  deckAt(x, z, y) {
    // returns deck height if (x,z) is on a deck and y is near/above it, else -Infinity
    let best = -Infinity;
    for (const d of this.decks) {
      if (d.gated && !this.flags[d.gated]) continue;
      const dx = x - d.x;
      const dz = z - d.z;
      // local coords: along = dot with (cos, -sin), across = dot with (sin, cos)
      const along = dx * d.cos - dz * d.sin;
      const across = dx * d.sin + dz * d.cos;
      if (Math.abs(along) <= d.len / 2 && Math.abs(across) <= d.wid / 2) {
        const h = d.h;
        if (y === undefined || y > h - 1.2) best = Math.max(best, h);
      }
    }
    return best;
  }

  groundAt(x, z, y) {
    const t = this.heightAt(x, z);
    const d = this.deckAt(x, z, y);
    return d > t ? d : t;
  }

  siteAt(x, z) {
    for (const s of DIG_SITES) {
      if (capsuleDist(x, z, s.a, s.b) <= s.r) return s.id;
    }
    return null;
  }

  siteShapeDist(x, z) {
    let best = { id: null, d: Infinity, edge: Infinity };
    for (const s of DIG_SITES) {
      const d = capsuleDist(x, z, s.a, s.b);
      const edge = d - s.r;
      if (edge < best.edge) best = { id: s.id, d, edge };
    }
    return best;
  }

  areaAt(x, z) {
    let best = AREAS[0];
    for (const a of AREAS) {
      if (a.id === 'wilds' || a.id === 'ocean') continue;
      const d = Math.hypot(x - a.x, z - a.z);
      if (d < a.r && a.r < best.r) best = a;
    }
    if (best.id === 'wilds' && this.heightAt(x, z) < -1.5) return AREAS[1];
    return best;
  }

  // ---- vertex color for terrain mesh ----
  colorAt(x, z, h, ny, out) {
    const n = this.n;
    const i = clamp(Math.round((x + this.half) / this.cell), 0, n - 1);
    const j = clamp(Math.round((z + this.half) / this.cell), 0, n - 1);
    const k = j * n + i;
    const type = this.biomeTypes[this.biomeIdx[k]];
    const N = this.noise;
    const v = N.noise(x / 9, z / 9) * 0.5 + N.noise(x / 37, z / 37) * 0.5;
    let r = 0,
      g = 0,
      b = 0;
    let rock;
    if (type === 'volcano') {
      const c = BIOME_COLORS.volcano;
      r = c[0];
      g = c[1];
      b = c[2];
      rock = ROCK_COLORS.volcano;
    } else {
      // gaussian-blended biome color (matches the height blend)
      let ws = 0.02;
      const m = BIOME_COLORS.meadow;
      r = m[0] * 0.02;
      g = m[1] * 0.02;
      b = m[2] * 0.02;
      let rr = ROCK_COLORS.meadow[0] * 0.02,
        rg = ROCK_COLORS.meadow[1] * 0.02,
        rb = ROCK_COLORS.meadow[2] * 0.02;
      for (const bm of BIOMES) {
        const dx = x - bm.x;
        const dz = z - bm.z;
        const w = Math.exp(-(dx * dx + dz * dz) / (2 * bm.s * bm.s));
        if (w < 0.004) continue;
        let c = BIOME_COLORS[bm.type];
        if (bm.type === 'mountain') {
          // alpine: grass low, stone high
          const t = smoothstep(42, 78, h + v * 8);
          c = [lerp(0.33, 0.52, t), lerp(0.55, 0.52, t), lerp(0.25, 0.54, t)];
        }
        r += c[0] * w;
        g += c[1] * w;
        b += c[2] * w;
        const rc = ROCK_COLORS[bm.type];
        rr += rc[0] * w;
        rg += rc[1] * w;
        rb += rc[2] * w;
        ws += w;
      }
      r /= ws;
      g /= ws;
      b /= ws;
      rock = [rr / ws, rg / ws, rb / ws];
      // grass patchiness
      const patch = this.noise2.noise(x / 23, z / 23);
      if (type === 'meadow' || type === 'forest' || type === 'valley' || type === 'cliffs' || type === 'wetland') {
        r += patch * 0.04;
        g += patch * 0.05;
      }
    }

    // mesa banding
    if (type === 'mesa' || type === 'desert') {
      const band = Math.sin(h * 1.3) * 0.05;
      r += band;
      g += band * 0.6;
    }
    // altitude snow
    const snowLine = 100 + 10 * N.noise(x / 50, z / 50);
    if (type !== 'volcano' && h > snowLine - 12) {
      const t = smoothstep(snowLine - 12, snowLine + 4, h);
      r = lerp(r, 0.93, t);
      g = lerp(g, 0.96, t);
      b = lerp(b, 1.0, t);
    }
    // slope -> rock
    const steep = smoothstep(0.86, 0.68, ny);
    if (steep > 0) {
      const rr = rock[0] + v * 0.04;
      r = lerp(r, rr, steep);
      g = lerp(g, rock[1] + v * 0.04, steep);
      b = lerp(b, rock[2] + v * 0.04, steep);
    }
    // beach band near sea level
    const water = this.water[k];
    if (h < 2.4 && h > -0.6 && type !== 'volcano') {
      const t = smoothstep(2.4, 1.2, h) * (1 - steep);
      r = lerp(r, 0.92, t);
      g = lerp(g, 0.84, t);
      b = lerp(b, 0.62, t);
    }
    if (type === 'volcano' && h < 3 && h > -0.5) {
      // black sand beach
      const t = smoothstep(3, 1, h);
      r = lerp(r, 0.18, t);
      g = lerp(g, 0.17, t);
      b = lerp(b, 0.18, t);
    }
    // underwater / riverbed
    if (water > -900 && h < water) {
      const depth = water - h;
      const t = smoothstep(0, 2.5, depth);
      const wt = this.waterType[k];
      if (wt === WATER_LAVA) {
        r = 0.2;
        g = 0.08;
        b = 0.05;
      } else {
        r = lerp(r * 0.8, 0.45, t * 0.6);
        g = lerp(g * 0.8, 0.42, t * 0.6);
        b = lerp(b * 0.8, 0.36, t * 0.6);
      }
    } else {
      // wet bank darkening
      const wn = this._nearWater(i, j);
      if (wn) {
        r *= 0.86;
        g *= 0.86;
        b *= 0.84;
      }
    }
    // dig sites
    const sd = this.siteShapeDist(x, z);
    if (sd.edge < 2.5) {
      const site = SITES[sd.id];
      const gc = GROUND_COLORS[site.ground];
      const t = smoothstep(2.5, -1.5, sd.edge);
      const speck = (this.noise2.noise(x * 0.9, z * 0.9) > 0.55 ? -0.07 : 0) + this.noise2.noise(x / 3, z / 3) * 0.04;
      r = lerp(r, gc[0] + speck, t);
      g = lerp(g, gc[1] + speck, t);
      b = lerp(b, gc[2] + speck, t);
      // darker rim
      if (sd.edge > -1.2 && sd.edge < 0.4) {
        r *= 0.82;
        g *= 0.8;
        b *= 0.78;
      }
    }
    // cave floor tint
    const kd = Math.hypot(x - CAVERN.x, z - CAVERN.z);
    if (kd < CAVERN.r - 4 && h < CAVERN.floor + 6) {
      const t = smoothstep(CAVERN.r - 4, CAVERN.r - 16, kd);
      r = lerp(r, 0.3, t * 0.7);
      g = lerp(g, 0.26, t * 0.7);
      b = lerp(b, 0.38, t * 0.7);
    }
    const varn = 1 + v * 0.07;
    out[0] = clamp(r * varn, 0, 1);
    out[1] = clamp(g * varn, 0, 1);
    out[2] = clamp(b * varn, 0, 1);
    return out;
  }

  _nearWater(i, j) {
    const n = this.n;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ii = i + di * 2;
        const jj = j + dj * 2;
        if (ii < 0 || jj < 0 || ii >= n || jj >= n) continue;
        const k = jj * n + ii;
        if (this.water[k] > -900 && this.waterType[k] !== WATER_LAVA) return true;
      }
    }
    return false;
  }

  biomeAt(x, z) {
    const n = this.n;
    const i = clamp(Math.round((x + this.half) / this.cell), 0, n - 1);
    const j = clamp(Math.round((z + this.half) / this.cell), 0, n - 1);
    return this.biomeTypes[this.biomeIdx[j * n + i]];
  }
}

export { closestOnPolyline };
