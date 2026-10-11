// Builds all towns / buildings / landmarks into a handful of merged meshes (per region bucket),
// registers colliders, sign text (single atlas texture) and dynamic bits (fires, beams, gates).
import * as THREE from 'three/webgpu';
import { vertexColor, uniform, vec3, float, mix, texture, uv, time, sin, positionWorld } from 'three/tsl';
import { GeoBuilder } from './geobuilder.js';
import { STRUCTURES } from '../data/places.js';
import { CAVERN } from './layout.js';

const BUCKET = 220;
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

class SignAtlas {
  constructor() {
    this.cols = 4;
    this.rows = 12;
    this.w = 2048;
    this.h = 2048;
    this.sw = this.w / this.cols;
    this.sh = Math.floor(this.h / this.rows);
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.w;
    this.canvas.height = this.h;
    this.g = this.canvas.getContext('2d');
    this.g.fillStyle = '#5a3a1e';
    this.g.fillRect(0, 0, this.w, this.h);
    this.n = 0;
  }

  add(lines, opts = {}) {
    const i = this.n++ % (this.cols * this.rows);
    const cx = (i % this.cols) * this.sw;
    const cy = Math.floor(i / this.cols) * this.sh;
    const g = this.g;
    const w = this.sw,
      h = this.sh;
    g.save();
    g.translate(cx, cy);
    g.fillStyle = opts.bg || '#7a4f2a';
    g.fillRect(0, 0, w, h);
    for (let k = 0; k < 10; k++) {
      g.fillStyle = `rgba(0,0,0,${0.05 + ((k * 37) % 7) * 0.012})`;
      g.fillRect(0, (k / 10) * h, w, 3 + (k % 3) * 2);
    }
    g.strokeStyle = opts.border || '#3d2410';
    g.lineWidth = 12;
    g.strokeRect(6, 6, w - 12, h - 12);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const n = lines.length;
    lines.forEach((line, li) => {
      const big = li === 0;
      let size = big ? (n === 1 ? 70 : 58) : 34;
      g.font = `900 ${size}px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
      while (g.measureText(line).width > w - 40 && size > 16) {
        size -= 2;
        g.font = `900 ${size}px ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", system-ui, sans-serif`;
      }
      const y = n === 1 ? h / 2 : big ? h * 0.38 : h * 0.74;
      g.lineWidth = 8;
      g.strokeStyle = 'rgba(0,0,0,0.65)';
      g.strokeText(line, w / 2, y);
      g.fillStyle = big ? opts.color || '#ffd23f' : '#fff4dc';
      g.fillText(line, w / 2, y);
    });
    g.restore();
    const u0 = cx / this.w,
      v0 = 1 - (cy + h) / this.h;
    return { u0, v0, u1: (cx + w) / this.w, v1: 1 - cy / this.h, aspect: w / h };
  }

  texture() {
    const t = new THREE.CanvasTexture(this.canvas);
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 4;
    return t;
  }
}

class QuadBuilder {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.nrm = [];
  }

  // quad centered at local (x,y,z) facing +Z in local space, under matrix base
  quad(base, x, y, z, w, h, r, twoSided = true) {
    const corners = [
      [-w / 2, -h / 2, r.u0, r.v0],
      [w / 2, -h / 2, r.u1, r.v0],
      [w / 2, h / 2, r.u1, r.v1],
      [-w / 2, h / 2, r.u0, r.v1],
    ];
    const P = corners.map(([cx, cy]) => new THREE.Vector3(x + cx, y + cy, z).applyMatrix4(base));
    const n = new THREE.Vector3(0, 0, 1).transformDirection(base);
    const tri = [0, 1, 2, 0, 2, 3];
    for (const t of tri) {
      this.pos.push(P[t].x, P[t].y, P[t].z);
      this.uv.push(corners[t][2], corners[t][3]);
      this.nrm.push(n.x, n.y, n.z);
    }
    if (twoSided) {
      // back side shows mirrored text: offset slightly and flip u
      const off = n.clone().multiplyScalar(-0.04);
      const triB = [0, 2, 1, 0, 3, 2];
      for (const t of triB) {
        this.pos.push(P[t].x + off.x, P[t].y + off.y, P[t].z + off.z);
        const c = corners[t];
        this.uv.push(r.u0 + r.u1 - c[2], c[3]);
        this.nrm.push(-n.x, -n.y, -n.z);
      }
    }
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.computeBoundingSphere();
    return g;
  }
}

export class Structures {
  constructor(world, scene, colliders, env) {
    this.world = world;
    this.scene = scene;
    this.colliders = colliders;
    this.env = env;
    this.group = new THREE.Group();
    this.group.name = 'structures';
    scene.add(this.group);
    this.buckets = new Map();
    this.atlas = new SignAtlas();
    this.signs = new QuadBuilder();
    this.flames = []; // {x,y,z,s}
    this.smokeSources = [];
    this.gated = {}; // flag -> {meshes:[], colliders:[], invert:bool}
    this.travelPosts = [];
    this.dynamic = [];
    this.nightGlow = uniform(0);
    this.museumSlots = [];
    this.lampPositions = [];
  }

  bucket(x, z, kind = 'lit') {
    const key = `${kind}:${Math.floor(x / BUCKET)}:${Math.floor(z / BUCKET)}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { gb: new GeoBuilder(), kind };
      this.buckets.set(key, b);
    }
    return b.gb;
  }

  gatedBuilder(flag, invert, kind = 'lit') {
    const key = `${flag}:${invert ? 'off' : 'on'}:${kind}`;
    let g = this.gated[key];
    if (!g) {
      g = this.gated[key] = { flag, invert, kind, gb: new GeoBuilder(), colliders: [] };
    }
    return g;
  }

  baseY(x, z, r) {
    const w = this.world;
    let y = w.heightAt(x, z);
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      y = Math.max(y, w.heightAt(x + Math.cos(ang) * r, z + Math.sin(ang) * r));
    }
    return y;
  }

  minY(x, z, r) {
    const w = this.world;
    let y = w.heightAt(x, z);
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      y = Math.min(y, w.heightAt(x + Math.cos(ang) * r, z + Math.sin(ang) * r));
    }
    return y;
  }

  frame(x, y, z, yaw) {
    _q.setFromAxisAngle(UP, yaw || 0);
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q, new THREE.Vector3(1, 1, 1));
  }

  // world position of local offset
  lw(o, lx, lz) {
    const c = Math.cos(o.yaw || 0),
      s = Math.sin(o.yaw || 0);
    return [o.x + lx * c + lz * s, o.z - lx * s + lz * c];
  }

  boxCollider(o, lx, lz, hx, hz, y0, y1, tag) {
    const [x, z] = this.lw(o, lx, lz);
    return this.colliders.addBox(x, z, hx, hz, o.yaw || 0, y0, y1, tag);
  }

  sign(base, x, y, z, w, lines, opts) {
    const r = this.atlas.add(lines, opts);
    const h = w / r.aspect;
    this.signs.quad(base, x, y, z, w, h, r);
  }

  build() {
    this.buildDecks();
    for (const o of STRUCTURES) {
      const fn = this['b_' + o.type];
      if (!fn) {
        console.warn('no builder for', o.type);
        continue;
      }
      fn.call(this, o);
    }
    this.finish();
  }

  // Bridges, piers and other walkable decks (data lives in WorldData.decks)
  buildDecks() {
    const w = this.world;
    for (const d of w.decks) {
      const stone = d.id === 'caldera_bridge';
      const plankCol = stone ? '#7d756c' : '#8a5a34';
      const plankCol2 = stone ? '#6e665d' : '#7a4f2a';
      const beamCol = stone ? '#5a534c' : '#5a3a1e';
      const base = this.frame(d.x, d.h, d.z, d.yaw);
      const half = d.len / 2;
      const gatedMid = d.gated ? this.gatedBuilder(d.gated, false) : null;
      const brokenMid = d.gated ? this.gatedBuilder(d.gated, true) : null;
      const plain = this.bucket(d.x, d.z);
      const pick = (lx) => {
        if (!gatedMid) return plain;
        return Math.abs(lx) < half - 22 ? gatedMid.gb : plain;
      };
      for (const g of [plain, gatedMid?.gb, brokenMid?.gb]) if (g) g.base = base;
      // planks
      const step = 0.62;
      for (let lx = -half + 0.3; lx <= half - 0.3; lx += step) {
        const gb = pick(lx);
        const jitter = ((lx * 7.3) % 1) * 0.04;
        gb.box(0.54, 0.16, d.wid, Math.round(lx / step) % 2 ? plankCol : plankCol2, { x: lx, y: -0.08 + jitter * 0.3, ry: jitter * 0.3 });
      }
      // side beams
      for (const sz of [-1, 1]) {
        if (gatedMid) {
          plain.box(22, 0.3, 0.3, beamCol, { x: -half + 11, y: -0.3, z: (sz * d.wid) / 2 - sz * 0.2 });
          plain.box(22, 0.3, 0.3, beamCol, { x: half - 11, y: -0.3, z: (sz * d.wid) / 2 - sz * 0.2 });
          gatedMid.gb.box(d.len - 44, 0.3, 0.3, beamCol, { y: -0.3, z: (sz * d.wid) / 2 - sz * 0.2 });
        } else plain.box(d.len, 0.3, 0.3, beamCol, { y: -0.3, z: (sz * d.wid) / 2 - sz * 0.2 });
      }
      // support posts down to the ground / river bed
      const postEvery = stone ? 10 : 6;
      for (let lx = -half + 1; lx <= half - 1; lx += postEvery) {
        for (const sz of [-1, 1]) {
          const lz = (sz * d.wid) / 2 - sz * 0.25;
          const [wx, wz] = this.lw({ x: d.x, z: d.z, yaw: d.yaw }, lx, lz);
          const th = w.heightAt(wx, wz);
          const hgt = d.h - th + 0.6;
          if (hgt < 0.4) continue;
          const gb = pick(lx);
          if (stone) gb.box(1.2, hgt, 1.2, '#6e665d', { x: lx, y: -hgt / 2 - 0.1, z: lz });
          else gb.cyl(0.18, 0.2, hgt, 6, beamCol, { x: lx, y: -hgt / 2 - 0.1, z: lz });
        }
      }
      // rails
      if (d.rail) {
        for (const sz of [-1, 1]) {
          const lz = (sz * d.wid) / 2 - sz * 0.1;
          for (let lx = -half + 0.5; lx <= half - 0.5; lx += 3) pick(lx).box(0.16, 1.1, 0.16, beamCol, { x: lx, y: 0.55, z: lz });
          if (gatedMid) {
            plain.box(22, 0.12, 0.12, beamCol, { x: -half + 11, y: 1.05, z: lz });
            plain.box(22, 0.12, 0.12, beamCol, { x: half - 11, y: 1.05, z: lz });
            gatedMid.gb.box(d.len - 44, 0.12, 0.12, beamCol, { y: 1.05, z: lz });
          } else plain.box(d.len, 0.12, 0.12, beamCol, { y: 1.05, z: lz });
          // keep players from walking off the sides
          const [cx, cz] = this.lw({ x: d.x, z: d.z, yaw: d.yaw }, 0, lz);
          const c = this.colliders.addBox(cx, cz, half, 0.12, d.yaw, d.h - 0.2, d.h + 1.3);
          if (gatedMid) gatedMid.colliders.push(c);
        }
      }
      if (stone) {
        // lamp posts along the long bridge
        const gl = this.bucket(d.x, d.z, 'glow');
        gl.base = base;
        for (let lx = -half + 6; lx < half; lx += 24) {
          for (const sz of [-1, 1]) {
            const lz = (sz * d.wid) / 2 - sz * 0.1;
            pick(lx).box(0.2, 3, 0.2, '#3a3a3a', { x: lx, y: 1.5, z: lz });
            gl.box(0.45, 0.5, 0.45, '#ffd27a', { x: lx, y: 3.1, z: lz });
          }
        }
        gl.base = null;
        // broken stubs + floating debris when not repaired
        brokenMid.gb.box(3, 0.16, d.wid * 0.8, plankCol2, { x: -half + 24, y: -0.6, rz: 0.4 });
        brokenMid.gb.box(3, 0.16, d.wid * 0.7, plankCol, { x: half - 24, y: -0.7, rz: -0.35 });
        for (let i = 0; i < 6; i++) brokenMid.gb.box(1.6, 0.14, 0.5, plankCol, { x: -30 + i * 11, y: -(d.h - 0.2), z: ((i * 37) % 5) - 2, ry: i });
      }
      for (const g of [plain, gatedMid?.gb, brokenMid?.gb]) if (g) g.base = null;
    }
  }

  finish() {
    const lit = new THREE.MeshLambertNodeMaterial({ vertexColors: true });
    const glow = new THREE.MeshBasicNodeMaterial({ vertexColors: true });
    glow.colorNode = vertexColor().rgb.mul(mix(float(0.55), float(1.35), this.nightGlow));
    const glowAlways = new THREE.MeshBasicNodeMaterial({ vertexColors: true });
    glowAlways.colorNode = vertexColor().rgb.mul(sin(time.mul(7).add(positionWorld.x.mul(3))).mul(0.06).add(1.0));
    this.materials = { lit, glow, fire: glowAlways };
    for (const [key, b] of this.buckets) {
      if (!b.gb.vertexCount) continue;
      const mat = b.kind === 'lit' ? lit : b.kind === 'glow' ? glow : glowAlways;
      const mesh = new THREE.Mesh(b.gb.toGeometry(), mat);
      mesh.castShadow = b.kind === 'lit';
      mesh.receiveShadow = b.kind === 'lit';
      mesh.name = key;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
    for (const g of Object.values(this.gated)) {
      if (!g.gb.vertexCount) continue;
      const mat = g.kind === 'lit' ? lit : g.kind === 'glow' ? glow : glowAlways;
      g.mesh = new THREE.Mesh(g.gb.toGeometry(), mat);
      g.mesh.castShadow = g.kind === 'lit';
      g.mesh.receiveShadow = true;
      g.mesh.matrixAutoUpdate = false;
      this.group.add(g.mesh);
    }
    // signs
    const tex = this.atlas.texture();
    const signMat = new THREE.MeshBasicNodeMaterial({ map: tex });
    signMat.colorNode = texture(tex, uv()).rgb.mul(mix(float(1.0), float(0.55), this.nightGlow));
    this.signMesh = new THREE.Mesh(this.signs.toGeometry(), signMat);
    this.signMesh.name = 'signs';
    this.signMesh.matrixAutoUpdate = false;
    this.group.add(this.signMesh);

    // flames (instanced, animated)
    if (this.flames.length) {
      const fg = new THREE.ConeGeometry(0.45, 1.3, 6, 1);
      fg.translate(0, 0.65, 0);
      const fm = new THREE.MeshBasicNodeMaterial();
      fm.colorNode = mix(vec3(1, 0.35, 0.05), vec3(1, 0.85, 0.3), sin(time.mul(12).add(positionWorld.x)).mul(0.5).add(0.5));
      this.flameMesh = new THREE.InstancedMesh(fg, fm, this.flames.length * 2);
      this.flameMesh.frustumCulled = false;
      this.group.add(this.flameMesh);
    }
    this.setFlags({});
  }

  setFlags(flags) {
    for (const g of Object.values(this.gated)) {
      const on = !!flags[g.flag];
      const visible = g.invert ? !on : on;
      if (g.mesh) g.mesh.visible = visible;
      for (const c of g.colliders) c.enabled = visible;
    }
  }

  update(dt, t, night) {
    this.nightGlow.value = night;
    if (this.flameMesh) {
      let k = 0;
      for (const f of this.flames) {
        for (let j = 0; j < 2; j++) {
          const flick = 0.85 + Math.sin(t * (9 + j * 4) + f.x * 3 + j) * 0.15 + Math.sin(t * 23 + f.z) * 0.05;
          _q.setFromAxisAngle(UP, t * (j ? -1.3 : 1.1) + f.x);
          const s = f.s * (j ? 0.65 : 1) * flick;
          _m.compose(_v.set(f.x + (j ? 0.15 : 0), f.y, f.z), _q, new THREE.Vector3(s, s * (1.1 + 0.2 * Math.sin(t * 15 + j)), s));
          this.flameMesh.setMatrixAt(k++, _m);
        }
      }
      this.flameMesh.instanceMatrix.needsUpdate = true;
    }
    for (const d of this.dynamic) d.update(dt, t, night);
  }

  // ------------------------------------------------------------------
  // Builders
  // ------------------------------------------------------------------
  foundation(gb, w, d, depth = 3, color = '#8d8478') {
    // extend down to the lowest ground under the footprint (buildings on slopes)
    const drop = this._drop || 0;
    const dd = Math.max(depth, drop + 1.5);
    gb.box(w + 0.6, dd, d + 0.6, color, { y: -dd / 2 + 0.3 });
  }

  // records how far the ground falls below y0 under a footprint, for foundation()
  footprintDrop(o, y0, r) {
    this._drop = y0 - this.minY(o.x, o.z, r);
    return this._drop;
  }

  b_shop(o) {
    const y0 = this.baseY(o.x, o.z, Math.max(o.w, o.d) * 0.55);
    this.footprintDrop(o, y0, Math.max(o.w, o.d) * 0.55);
    const gb = this.bucket(o.x, o.z);
    const gl = this.bucket(o.x, o.z, 'glow');
    const base = this.frame(o.x, y0, o.z, o.yaw);
    gb.base = gl.base = base;
    const { w, d, h } = o;
    this.foundation(gb, w, d);
    gb.box(w, h, d, o.wall, { y: 0.3 + h / 2 });
    const post = '#5a3a1e';
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(0.45, h + 0.1, 0.45, post, { x: (sx * w) / 2, y: 0.3 + h / 2, z: (sz * d) / 2 });
    gb.box(w + 0.2, 0.35, d + 0.2, post, { y: 0.3 + h });
    gb.roof(w + 1.4, 2.6, d + 1.4, o.roof, { y: 0.3 + h + 0.15 });
    gb.box(0.8, 1.6, 0.8, '#8a7f74', { x: w * 0.3, y: 0.3 + h + 2.2, z: -d * 0.15 });
    // door + windows
    gb.box(1.8, 2.6, 0.2, '#4a2e17', { y: 0.3 + 1.3, z: d / 2 + 0.05 });
    for (const sx of [-1, 1]) {
      gl.box(1.6, 1.2, 0.12, '#ffd98a', { x: sx * w * 0.3, y: 0.3 + h * 0.55, z: d / 2 + 0.06 });
      gb.box(1.9, 0.18, 0.25, post, { x: sx * w * 0.3, y: 0.3 + h * 0.55 - 0.68, z: d / 2 + 0.1 });
    }
    // counter
    const cz = d / 2 + 3.2;
    gb.box(w * 0.55, 1.05, 1.0, '#7a4f2a', { y: 0.3 + 0.52, z: cz });
    gb.box(w * 0.58, 0.15, 1.2, '#a0703f', { y: 0.3 + 1.1, z: cz });
    // awning posts + striped awning
    for (const sx of [-1, 1]) gb.box(0.25, h * 0.75, 0.25, post, { x: sx * w * 0.32, y: 0.3 + (h * 0.75) / 2, z: cz + 0.7 });
    const strips = 7;
    for (let i = 0; i < strips; i++) {
      const sw = (w * 0.7) / strips;
      gb.box(sw, 0.12, 4.2, i % 2 ? '#ffffff' : o.awning || '#c0392b', { x: -w * 0.35 + sw * (i + 0.5), y: 0.3 + h * 0.78, z: d / 2 + 2.0, rx: 0.22 });
    }
    // sign above door
    if (o.sign) this.sign(base, 0, 0.3 + h + 1.25, d / 2 + 0.75, Math.min(w * 0.8, 9), o.sign);
    gb.base = gl.base = null;
    this.boxCollider(o, 0, 0, w / 2 + 0.3, d / 2 + 0.3, y0 - 5, y0 + h + 4);
    this.boxCollider(o, 0, cz, w * 0.29, 0.6, y0 - 2, y0 + 1.4);
  }

  b_house(o) {
    const y0 = this.baseY(o.x, o.z, Math.max(o.w, o.d) * 0.55);
    this.footprintDrop(o, y0, Math.max(o.w, o.d) * 0.55);
    const gb = this.bucket(o.x, o.z);
    const gl = this.bucket(o.x, o.z, 'glow');
    gb.base = gl.base = this.frame(o.x, y0, o.z, o.yaw);
    const { w, d, h } = o;
    this.foundation(gb, w, d);
    gb.box(w, h, d, o.wall, { y: 0.3 + h / 2 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(0.4, h, 0.4, '#5a3a1e', { x: (sx * w) / 2, y: 0.3 + h / 2, z: (sz * d) / 2 });
    gb.roof(w + 1.2, 2.4, d + 1.2, o.roof, { y: 0.3 + h });
    gb.box(1.6, 2.4, 0.2, '#4a2e17', { y: 1.5, z: d / 2 + 0.05 });
    gl.box(1.3, 1.1, 0.12, '#ffd98a', { x: w * 0.28, y: 0.3 + h * 0.55, z: d / 2 + 0.06 });
    gl.box(0.12, 1.1, 1.3, '#ffd98a', { x: w / 2 + 0.06, y: 0.3 + h * 0.55 });
    gb.box(0.9, 2.2, 0.9, '#8a7f74', { x: -w * 0.3, y: 0.3 + h + 1.5, z: 0 });
    gb.base = gl.base = null;
    this.boxCollider(o, 0, 0, w / 2 + 0.3, d / 2 + 0.3, y0 - 5, y0 + h + 4);
    this.smokeSources.push({ x: this.lw(o, -w * 0.3, 0)[0], y: y0 + h + 2.8, z: this.lw(o, -w * 0.3, 0)[1], rate: 0.3 });
  }

  b_cabin(o) {
    const w = 11,
      d = 9,
      h = 4.6;
    const y0 = this.baseY(o.x, o.z, 7);
    this.footprintDrop(o, y0, 7);
    const gb = this.bucket(o.x, o.z);
    const gl = this.bucket(o.x, o.z, 'glow');
    const base = this.frame(o.x, y0, o.z, o.yaw);
    gb.base = gl.base = base;
    this.foundation(gb, w, d, 3, '#6d6a66');
    const logs = 8;
    for (let i = 0; i < logs; i++) {
      const c = i % 2 ? '#7a4f2a' : '#6b4423';
      gb.box(w, h / logs, d, o.hot ? (i % 2 ? '#3a2a24' : '#2e211c') : c, { y: 0.3 + (h / logs) * (i + 0.5) });
    }
    gb.roof(w + 1.6, 3, d + 1.6, o.hot ? '#5a1e10' : '#f2f6fb', { y: 0.3 + h });
    gb.box(1.8, 2.6, 0.2, '#3a2412', { y: 1.6, z: d / 2 + 0.05 });
    for (const sx of [-1, 1]) gl.box(1.4, 1.2, 0.12, '#ffcf7a', { x: sx * w * 0.3, y: 0.3 + h * 0.55, z: d / 2 + 0.06 });
    gb.box(1, 3, 1, '#7d7a76', { x: w * 0.3, y: 0.3 + h + 1.8 });
    const cz = d / 2 + 3.2;
    gb.box(w * 0.55, 1.05, 1.0, '#6b4423', { y: 0.82, z: cz });
    gb.box(w * 0.58, 0.15, 1.2, '#a0703f', { y: 1.4, z: cz });
    if (o.sign) this.sign(base, 0, 0.3 + h + 1.4, d / 2 + 0.85, 8.5, o.sign, o.hot ? { color: '#ff8a3c' } : { color: '#9fe3ff' });
    gb.base = gl.base = null;
    this.boxCollider(o, 0, 0, w / 2 + 0.3, d / 2 + 0.3, y0 - 5, y0 + h + 4);
    this.boxCollider(o, 0, cz, w * 0.29, 0.6, y0 - 2, y0 + 1.4);
    const [sx, sz] = this.lw(o, w * 0.3, 0);
    this.smokeSources.push({ x: sx, y: y0 + h + 3.6, z: sz, rate: 0.5 });
  }

  b_statue(o) {
    const y0 = this.baseY(o.x, o.z, 2);
    const gb = this.bucket(o.x, o.z);
    const base = this.frame(o.x, y0, o.z, o.yaw);
    gb.base = base;
    gb.box(3.2, 1.4, 3.2, '#9a948c', { y: 0.4 });
    gb.box(2.6, 0.4, 2.6, '#b4ada4', { y: 1.3 });
    const gold = '#e5b53a';
    const s = 1.35;
    // blocky prospector
    gb.box(0.38 * s, 0.76 * s, 0.38 * s, gold, { x: -0.2 * s, y: 1.5 + 0.38 * s });
    gb.box(0.38 * s, 0.76 * s, 0.38 * s, gold, { x: 0.2 * s, y: 1.5 + 0.38 * s });
    gb.box(0.76 * s, 0.76 * s, 0.38 * s, gold, { y: 1.5 + 1.14 * s });
    gb.box(0.46 * s, 0.46 * s, 0.46 * s, gold, { y: 1.5 + 1.75 * s });
    gb.box(0.95 * s, 0.06 * s, 0.95 * s, gold, { y: 1.5 + 2.0 * s });
    gb.box(0.5 * s, 0.25 * s, 0.5 * s, gold, { y: 1.5 + 2.15 * s });
    gb.box(0.38 * s, 0.76 * s, 0.38 * s, gold, { x: -0.57 * s, y: 1.5 + 1.25 * s, z: 0.25 * s, rx: -1.2 });
    gb.box(0.38 * s, 0.76 * s, 0.38 * s, gold, { x: 0.57 * s, y: 1.5 + 1.25 * s, z: 0.25 * s, rx: -1.2 });
    gb.cyl(0.6 * s, 0.45 * s, 0.12 * s, 12, gold, { y: 1.5 + 1.35 * s, z: 0.75 * s });
    this.sign(base, 0, 0.55, 1.62, 2.6, ['Old Prospector', 'Rubble Creek, est. 1849'], { color: '#ffe08a' });
    gb.base = null;
    this.colliders.addCircle(o.x, o.z, 1.9, y0 - 3, y0 + 5);
  }

  b_campfire(o) {
    const y0 = this.world.heightAt(o.x, o.z);
    const gb = this.bucket(o.x, o.z);
    const gl = this.bucket(o.x, o.z, 'fire');
    gb.base = gl.base = this.frame(o.x, y0, o.z, 0);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      gb.dodeca(0.32, '#6e6a64', { x: Math.cos(a) * 1.05, y: 0.1, z: Math.sin(a) * 1.05, ry: a, sy: 0.7 });
    }
    for (let i = 0; i < 3; i++) gb.cyl(0.13, 0.13, 1.5, 6, '#5a3a1e', { y: 0.25, ry: (i / 3) * Math.PI, rz: Math.PI / 2 - 0.25 });
    gl.sphere(0.45, '#ff6a1a', { y: 0.25, sy: 0.4 }, 0);
    gb.base = gl.base = null;
    this.flames.push({ x: o.x, y: y0 + 0.2, z: o.z, s: 1 });
    this.smokeSources.push({ x: o.x, y: y0 + 1.6, z: o.z, rate: 1 });
    this.colliders.addCircle(o.x, o.z, 1.3, y0 - 2, y0 + 0.5);
    (this.campfires ||= []).push({ x: o.x, z: o.z, y: y0 });
  }

  b_crate(o) {
    const s = o.s || 1;
    const y0 = this.world.heightAt(o.x, o.z);
    const gb = this.bucket(o.x, o.z);
    gb.base = this.frame(o.x, y0, o.z, (o.x * 7) % 1);
    gb.box(1.1 * s, 1.1 * s, 1.1 * s, '#a0703f', { y: 0.55 * s });
    gb.box(1.15 * s, 0.15 * s, 1.15 * s, '#6b4423', { y: 0.2 * s });
    gb.box(1.15 * s, 0.15 * s, 1.15 * s, '#6b4423', { y: 0.95 * s });
    gb.base = null;
    this.colliders.addCircle(o.x, o.z, 0.75 * s, y0 - 2, y0 + 1.1 * s);
  }

  b_barrel(o) {
    const y0 = this.world.heightAt(o.x, o.z);
    const gb = this.bucket(o.x, o.z);
    gb.base = this.frame(o.x, y0, o.z, 0);
    gb.cyl(0.5, 0.45, 1.2, 10, '#8a5a2b', { y: 0.6 });
    gb.cyl(0.52, 0.52, 0.1, 10, '#4a4a4a', { y: 0.3 });
    gb.cyl(0.52, 0.52, 0.1, 10, '#4a4a4a', { y: 0.95 });
    gb.base = null;
    this.colliders.addCircle(o.x, o.z, 0.55, y0 - 2, y0 + 1.2);
  }

  b_bench(o) {
    const y0 = this.world.heightAt(o.x, o.z);
    const gb = this.bucket(o.x, o.z);
    gb.base = this.frame(o.x, y0, o.z, o.yaw);
    gb.box(2.4, 0.12, 0.6, '#8a5a2b', { y: 0.55 });
    gb.box(2.4, 0.5, 0.1, '#8a5a2b', { y: 0.85, z: -0.28 });
    for (const sx of [-1, 1]) gb.box(0.12, 0.55, 0.55, '#4a3a2a', { x: sx * 1.05, y: 0.27 });
    gb.base = null;
    this.colliders.addCircle(o.x, o.z, 0.9, y0 - 2, y0 + 0.6);
  }

  b_lamp(o) {
    const y0 = this.world.heightAt(o.x, o.z);
    const gb = this.bucket(o.x, o.z);
    const gl = this.bucket(o.x, o.z, 'glow');
    gb.base = gl.base = this.frame(o.x, y0, o.z, 0);
    gb.cyl(0.1, 0.14, 3.6, 6, '#2d2d2d', { y: 1.8 });
    gb.box(0.7, 0.1, 0.7, '#2d2d2d', { y: 3.6 });
    gl.box(0.5, 0.6, 0.5, '#ffd27a', { y: 3.95 });
    gb.cone(0.5, 0.35, 4, '#2d2d2d', { y: 4.4, ry: Math.PI / 4 });
    gb.base = gl.base = null;
    this.colliders.addCircle(o.x, o.z, 0.25, y0 - 2, y0 + 4);
    this.lampPositions.push([o.x, y0 + 3.95, o.z]);
  }

  b_fence(o) {
    const gb = this.bucket(o.x, o.z);
    const dx = o.x2 - o.x,
      dz = o.z2 - o.z;
    const len = Math.hypot(dx, dz);
    const n = Math.ceil(len / 3);
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = o.x + dx * t,
        z = o.z + dz * t;
      const y = this.world.heightAt(x, z);
      gb.box(0.2, 1.2, 0.2, '#6b4423', { x, y: y + 0.6, z });
      if (i < n) {
        const x2 = o.x + dx * ((i + 1) / n),
          z2 = o.z + dz * ((i + 1) / n);
        const y2 = this.world.heightAt(x2, z2);
        const mx = (x + x2) / 2,
          mz = (z + z2) / 2,
          my = (y + y2) / 2;
        const yaw = Math.atan2(-(z2 - z), x2 - x);
        const seg = Math.hypot(x2 - x, z2 - z);
        const pitch = Math.atan2(y2 - y, seg);
        for (const hy of [0.55, 0.95]) gb.box(seg, 0.1, 0.08, '#8a5a2b', { x: mx, y: my + hy, z: mz, ry: yaw, rz: pitch });
      }
    }
  }

  b_signpost(o) {
    const y0 = this.world.heightAt(o.x, o.z);
    const gb = this.bucket(o.x, o.z);
    const base = this.frame(o.x, y0, o.z, o.yaw);
    gb.base = base;
    for (const sx of [-1, 1]) gb.box(0.18, 2.6, 0.18, '#5a3a1e', { x: sx * 1.5, y: 1.3 });
    gb.box(3.4, 1.0, 0.12, '#5a3a1e', { y: 2.15 });
    this.sign(base, 0, 2.15, 0.08, 3.3, o.sign, { color: '#ffd23f' });
    gb.base = null;
    for (const sx of [-1, 1]) {
      const [x, z] = this.lw(o, sx * 1.5, 0);
      this.colliders.addCircle(x, z, 0.2, y0 - 2, y0 + 2.6);
    }
  }

  b_travel(o) {
    const y0 = this.world.heightAt(o.x, o.z);
    const gb = this.bucket(o.x, o.z);
    const gl = this.bucket(o.x, o.z, 'glow');
    const base = this.frame(o.x, y0, o.z, 0);
    gb.base = gl.base = base;
    gb.cyl(0.9, 1.1, 0.4, 8, '#8d8478', { y: 0.2 });
    gb.cyl(0.14, 0.14, 3.2, 6, '#5a3a1e', { y: 1.8 });
    for (let i = 0; i < 4; i++) gb.box(1.6, 0.35, 0.08, ['#c0392b', '#2980b9', '#27ae60', '#f39c12'][i], { x: 0.5, y: 2.2 + i * 0.4, ry: i * 1.3, z: 0 });
    gl.torus(0.9, 0.06, '#7affea', { y: 0.45, rx: Math.PI / 2 });
    gl.sphere(0.22, '#7affea', { y: 3.5 }, 1);
    gb.base = gl.base = null;
    this.colliders.addCircle(o.x, o.z, 0.5, y0 - 2, y0 + 3);
    this.travelPosts.push({ town: o.town, x: o.x, z: o.z, y: y0 });
  }

  b_board(o) {
    const y0 = this.world.heightAt(o.x, o.z);
    const gb = this.bucket(o.x, o.z);
    const base = this.frame(o.x, y0, o.z, o.yaw);
    gb.base = base;
    for (const sx of [-1, 1]) gb.box(0.2, 2.8, 0.2, '#5a3a1e', { x: sx * 1.4, y: 1.4 });
    gb.box(3.0, 1.9, 0.14, '#8a5a2b', { y: 1.75 });
    gb.roof(3.4, 0.6, 0.8, '#7a3b2a', { y: 2.75 });
    const papers = [
      [-0.9, 1.4],
      [0, 1.5],
      [0.9, 1.35],
      [-0.5, 2.1],
      [0.6, 2.15],
    ];
    for (const [px, py] of papers) gb.box(0.6, 0.75, 0.03, '#f4ecd8', { x: px, y: py, z: 0.09, rz: (px * 0.3) % 0.2 });
    this.sign(base, 0, 3.35, 0.2, 2.4, [o.sign[0]], { color: '#ffd23f' });
    gb.base = null;
    this.boxCollider(o, 0, 0, 1.6, 0.3, y0 - 2, y0 + 3);
  }

  b_tent(o) {
    const big = o.big ? 1.5 : 1;
    const w = 4.4 * big,
      d = 5 * big,
      h = 3 * big;
    const y0 = this.minY(o.x, o.z, 2.5 * big) + 0.05;
    const gb = this.bucket(o.x, o.z);
    gb.base = this.frame(o.x, y0, o.z, o.yaw);
    // ridge along local Z so the open end faces +Z
    gb.roof(w, h, d, o.color, { ry: Math.PI / 2 });
    gb.box(0.12, h + 0.3, 0.12, '#5a3a1e', { y: (h + 0.3) / 2, z: d / 2 });
    gb.box(0.12, h + 0.3, 0.12, '#5a3a1e', { y: (h + 0.3) / 2, z: -d / 2 });
    gb.box(w * 0.3, h * 0.55, 0.05, '#2a1e14', { y: h * 0.27, z: d / 2 + 0.02 });
    gb.base = null;
    this.boxCollider(o, 0, 0, w / 2, d / 2, y0 - 2, y0 + h);
  }

  b_mine(o) {
    const y0 = this.world.heightAt(o.x, o.z);
    const gb = this.bucket(o.x, o.z);
    const gl = this.bucket(o.x, o.z, 'glow');
    const base = this.frame(o.x, y0, o.z, o.yaw);
    gb.base = gl.base = base;
    // rocky hill
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI - Math.PI;
      gb.dodeca(4 + (i % 3), '#7d7468', { x: Math.cos(a) * 6, y: 2 + (i % 2) * 2, z: Math.sin(a) * 4 - 2, ry: i });
    }
    gb.dodeca(7, '#7d7468', { y: 3, z: -5, sy: 0.8 });
    gb.box(4.4, 4.2, 3, '#151210', { y: 2.1, z: 0.2 });
    for (const sx of [-1, 1]) gb.box(0.5, 4.6, 0.5, '#6b4423', { x: sx * 2.2, y: 2.3, z: 1.8 });
    gb.box(5.4, 0.55, 0.6, '#6b4423', { y: 4.6, z: 1.8 });
    for (const sx of [-0.6, 0.6]) gb.box(0.12, 0.12, 9, '#555', { x: sx, y: 0.1, z: 4 });
    for (let i = 0; i < 6; i++) gb.box(1.8, 0.1, 0.25, '#5a3a1e', { y: 0.05, z: 1 + i * 1.4 });
    gl.box(0.4, 0.5, 0.4, '#ffd27a', { x: 2.2, y: 3.4, z: 2.2 });
    this.sign(base, 0, 5.4, 2.15, 4, ['Old Mine', 'Keep Out!'], { color: '#ff7b6b' });
    gb.base = gl.base = null;
    this.boxCollider(o, 0, -2, 7, 5, y0 - 5, y0 + 9);
  }

  b_generator(o) {
    const y0 = this.baseY(o.x, o.z, 2);
    const gb = this.bucket(o.x, o.z);
    const gl = this.bucket(o.x, o.z, 'glow');
    const on = this.gatedBuilder('cave_open', false, 'glow');
    const off = this.gatedBuilder('cave_open', true, 'glow');
    const base = this.frame(o.x, y0, o.z, o.yaw);
    gb.base = gl.base = on.gb.base = off.gb.base = base;
    gb.box(3.4, 0.4, 2.4, '#5a5a5a', { y: 0.2 });
    gb.box(3, 2, 2, '#c0782a', { y: 1.4 });
    gb.cyl(0.3, 0.3, 2.4, 8, '#444', { x: 1, y: 3.2 });
    gb.cyl(0.9, 0.9, 0.3, 12, '#333', { x: -0.6, y: 1.6, z: 1.05, rx: Math.PI / 2 });
    gb.box(0.2, 0.2, 6, '#333', { x: -1.6, y: 0.4, z: -3 });
    on.gb.sphere(0.25, '#5fe36a', { x: 0.8, y: 2.1, z: 1.02 }, 0);
    off.gb.sphere(0.25, '#ff3b3b', { x: 0.8, y: 2.1, z: 1.02 }, 0);
    gb.base = gl.base = on.gb.base = off.gb.base = null;
    this.boxCollider(o, 0, 0, 1.8, 1.3, y0 - 2, y0 + 3);
    const [sx, sz] = this.lw(o, 1, 0);
    this.generatorSmoke = { x: sx, y: y0 + 4.5, z: sz, rate: 1.5, flag: 'cave_open' };
  }

  b_cart(o) {
    const y0 = this.world.heightAt(o.x, o.z);
    const gb = this.bucket(o.x, o.z);
    gb.base = this.frame(o.x, y0, o.z, o.yaw);
    gb.box(1.6, 0.9, 1.1, '#6b5a4a', { y: 0.8 });
    for (const sx of [-0.6, 0.6]) for (const sz of [-0.55, 0.55]) gb.cyl(0.28, 0.28, 0.12, 8, '#333', { x: sx, y: 0.3, z: sz, rx: Math.PI / 2 });
    for (let i = 0; i < 5; i++) gb.dodeca(0.3, ['#d4a017', '#9aa4ae', '#b87333'][i % 3], { x: -0.4 + i * 0.2, y: 1.35, z: (i % 2) * 0.2 - 0.1 });
    gb.base = null;
    this.colliders.addCircle(o.x, o.z, 1, y0 - 2, y0 + 1.4);
  }

  b_museum(o) {
    const W = 30,
      D = 24,
      H = 9;
    const y0 = this.baseY(o.x, o.z, 17);
    const gb = this.bucket(o.x, o.z);
    const gl = this.bucket(o.x, o.z, 'glow');
    const base = this.frame(o.x, y0, o.z, o.yaw);
    gb.base = gl.base = base;
    const stone = '#e8e2d4',
      trim = '#c9bfa8',
      floor = '#b9ad95';
    gb.box(W + 2, 4, D + 6, '#a49a88', { y: -1.4, z: 1.5 });
    // steps
    for (let i = 0; i < 3; i++) gb.box(W * 0.6, 0.3, 1, trim, { y: 0.6 - i * 0.3, z: D / 2 + 1 + i });
    gb.box(W, 0.2, D, floor, { y: 0.7 });
    // walls: back, sides, front with wide opening
    const wt = 0.8;
    gb.box(W, H, wt, stone, { y: 0.8 + H / 2, z: -D / 2 + wt / 2 });
    gb.box(wt, H, D, stone, { x: -W / 2 + wt / 2, y: 0.8 + H / 2 });
    gb.box(wt, H, D, stone, { x: W / 2 - wt / 2, y: 0.8 + H / 2 });
    gb.box(W * 0.3, H, wt, stone, { x: -W * 0.35, y: 0.8 + H / 2, z: D / 2 - wt / 2 });
    gb.box(W * 0.3, H, wt, stone, { x: W * 0.35, y: 0.8 + H / 2, z: D / 2 - wt / 2 });
    gb.box(W * 0.4, H * 0.3, wt, stone, { y: 0.8 + H * 0.85, z: D / 2 - wt / 2 });
    // roof slab + pediment
    gb.box(W + 1.5, 1, D + 4.5, trim, { y: 0.8 + H + 0.5, z: 1.5 });
    gb.roof(W + 1.5, 3.4, D + 4.5, '#7d8a99', { y: 0.8 + H + 1, z: 1.5 });
    // columns at portico
    for (let i = 0; i < 6; i++) {
      const cx = -W / 2 + 2.5 + (i * (W - 5)) / 5;
      gb.cyl(0.6, 0.7, H, 10, '#f4efe4', { x: cx, y: 0.8 + H / 2, z: D / 2 + 3.4 });
      gb.box(1.6, 0.4, 1.6, trim, { x: cx, y: 0.9, z: D / 2 + 3.4 });
      gb.box(1.6, 0.4, 1.6, trim, { x: cx, y: 0.8 + H - 0.2, z: D / 2 + 3.4 });
    }
    gb.box(W + 1, 0.3, 5.5, trim, { y: 0.75, z: D / 2 + 2.6 });
    // interior: display tables (4 rows x 18 slots)
    const rows = 4,
      per = 18;
    const tableW = W - 5;
    for (let r = 0; r < rows; r++) {
      const tz = -D / 2 + 3.5 + r * 4.6;
      gb.box(tableW, 1.0, 1.4, '#6b4423', { y: 0.8 + 0.5, z: tz });
      gb.box(tableW + 0.2, 0.12, 1.6, '#a0703f', { y: 0.8 + 1.05, z: tz });
      for (let k = 0; k < per; k++) {
        const sx = -tableW / 2 + (tableW / per) * (k + 0.5);
        gb.box(0.9, 0.12, 0.9, '#f4ecd8', { x: sx, y: 0.8 + 1.15, z: tz });
        const wp = new THREE.Vector3(sx, 0.8 + 1.55, tz).applyMatrix4(base);
        this.museumSlots.push(wp);
      }
      const [cx1, cz1] = this.lw(o, 0, tz);
      this.colliders.addBox(cx1, cz1, tableW / 2 + 0.1, 0.8, o.yaw, y0 - 2, y0 + 2);
    }
    // skylight glow strips
    for (let r = 0; r < 3; r++) gl.box(W - 6, 0.1, 0.6, '#fff4cf', { y: 0.8 + H - 0.1, z: -D / 2 + 5.5 + r * 6 });
    this.sign(base, 0, 0.8 + H + 2.0, D / 2 + 3.85, 11, ['MUSEUM', 'of Natural Wonders'], { color: '#ffe08a', bg: '#6b6455', border: '#3d382f' });
    gb.base = gl.base = null;
    // colliders: walls & columns
    this.boxCollider(o, 0, -D / 2 + wt / 2, W / 2, wt / 2 + 0.2, y0 - 5, y0 + H + 4);
    this.boxCollider(o, -W / 2 + wt / 2, 0, wt / 2 + 0.2, D / 2, y0 - 5, y0 + H + 4);
    this.boxCollider(o, W / 2 - wt / 2, 0, wt / 2 + 0.2, D / 2, y0 - 5, y0 + H + 4);
    this.boxCollider(o, -W * 0.35, D / 2 - wt / 2, W * 0.15, wt / 2 + 0.2, y0 - 5, y0 + H + 4);
    this.boxCollider(o, W * 0.35, D / 2 - wt / 2, W * 0.15, wt / 2 + 0.2, y0 - 5, y0 + H + 4);
    for (let i = 0; i < 6; i++) {
      const cx = -W / 2 + 2.5 + (i * (W - 5)) / 5;
      const [x, z] = this.lw(o, cx, D / 2 + 3.4);
      this.colliders.addCircle(x, z, 0.75, y0 - 2, y0 + H);
    }
    // walkable floor platform
    const [fx, fz] = this.lw(o, 0, 1.5);
    const plat = this.colliders.addBox(fx, fz, W / 2 + 1, D / 2 + 3, o.yaw, y0 - 10, y0 + 0.8);
    plat.platform = true;
    plat.enabled = true;
    plat.y0 = y0 + 5; // never blocks sideways (y0 above top): acts only as a floor
    this.museumBase = { x: o.x, z: o.z, y: y0 + 0.8 };
  }

  b_forge(o) {
    const y0 = this.baseY(o.x, o.z, 5);
    this.footprintDrop(o, y0, 5);
    const gb = this.bucket(o.x, o.z);
    const gl = this.bucket(o.x, o.z, 'fire');
    const base = this.frame(o.x, y0, o.z, o.yaw);
    gb.base = gl.base = base;
    const w = 10,
      d = 8,
      h = 4.4;
    this.foundation(gb, w, d, 2.5, '#7a7268');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(0.5, h, 0.5, '#4a2e17', { x: (sx * w) / 2, y: 0.3 + h / 2, z: (sz * d) / 2 });
    gb.roof(w + 1, 2.2, d + 1, '#5a5048', { y: 0.3 + h });
    gb.box(w, h, 0.4, '#8a7f74', { y: 0.3 + h / 2, z: -d / 2 });
    // forge hearth
    gb.box(3, 1.6, 2.4, '#6d6a66', { x: -2.6, y: 1.1, z: -2 });
    gl.box(2.2, 0.2, 1.6, '#ff5a1a', { x: -2.6, y: 1.95, z: -2 });
    gb.box(1.2, 4.6, 1.2, '#6d6a66', { x: -2.6, y: 3.6, z: -2.4 });
    // anvil on stump
    gb.cyl(0.55, 0.6, 0.8, 8, '#6b4423', { x: 1.5, y: 0.7, z: 0.5 });
    gb.box(1.2, 0.35, 0.5, '#3a3a3e', { x: 1.5, y: 1.25, z: 0.5 });
    gb.box(0.5, 0.3, 0.4, '#3a3a3e', { x: 1.5, y: 1.0, z: 0.5 });
    gb.cone(0.25, 0.6, 4, '#3a3a3e', { x: 2.3, y: 1.3, z: 0.5, rz: -Math.PI / 2 });
    if (o.sign) this.sign(base, 0, 0.3 + h + 1.1, d / 2 + 0.6, 7, o.sign, { color: '#ff9a3c' });
    gb.base = gl.base = null;
    this.boxCollider(o, 0, -d / 2, w / 2, 0.4, y0 - 2, y0 + h);
    const [hx, hz] = this.lw(o, -2.6, -2);
    this.colliders.addCircle(hx, hz, 1.7, y0 - 2, y0 + 3);
    const [ax, az] = this.lw(o, 1.5, 0.5);
    this.colliders.addCircle(ax, az, 0.8, y0 - 2, y0 + 1.4);
    const [cx, cz] = this.lw(o, -2.6, -2.4);
    this.smokeSources.push({ x: cx, y: y0 + 6.2, z: cz, rate: 1.2 });
    this.flames.push({ x: hx, y: y0 + 1.95, z: hz, s: 0.7 });
  }

  b_startent(o) {
    const y0 = this.baseY(o.x, o.z, 4);
    const gb = this.bucket(o.x, o.z);
    const gl = this.bucket(o.x, o.z, 'glow');
    const base = this.frame(o.x, y0, o.z, o.yaw);
    gb.base = gl.base = base;
    gb.cyl(4.2, 4.2, 0.3, 12, '#5a4a7a', { y: 0.15 });
    gb.cyl(4, 4, 3, 12, '#4b2a8a', { y: 1.8 });
    gb.cone(4.6, 3.4, 12, '#6c3fd1', { y: 4.95 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      gl.sphere(0.12, '#fff6a8', { x: Math.cos(a) * 4.05, y: 1.2 + (i % 3) * 0.8, z: Math.sin(a) * 4.05 }, 0);
    }
    gb.box(1.6, 2.4, 0.2, '#22104a', { y: 1.5, z: 4.0 });
    // telescope
    for (let i = 0; i < 3; i++) gb.box(0.08, 1.6, 0.08, '#333', { x: 4.6 + Math.cos(i * 2.1) * 0.35, y: 0.8, z: 2 + Math.sin(i * 2.1) * 0.35, rz: Math.cos(i * 2.1) * 0.2, rx: Math.sin(i * 2.1) * 0.2 });
    gb.cyl(0.18, 0.25, 2.2, 8, '#c9a227', { x: 4.6, y: 2.0, z: 2, rx: -0.9 });
    // counter
    gb.box(4, 1.05, 1, '#3a2a5a', { y: 0.82, z: 6.6 });
    gb.box(4.2, 0.12, 1.2, '#8a6bd9', { y: 1.4, z: 6.6 });
    if (o.sign) this.sign(base, 0, 4.0, 4.5, 6, o.sign, { color: '#cfa8ff', bg: '#2a1650', border: '#140a2a' });
    gb.base = gl.base = null;
    this.colliders.addCircle(o.x, o.z, 4.3, y0 - 2, y0 + 6);
    this.boxCollider(o, 0, 6.6, 2.1, 0.6, y0 - 2, y0 + 1.4);
  }

  b_well(o) {
    const y0 = this.world.heightAt(o.x, o.z);
    const gb = this.bucket(o.x, o.z);
    gb.base = this.frame(o.x, y0, o.z, 0);
    gb.cyl(1.3, 1.4, 1.1, 12, '#8d8478', { y: 0.55 });
    gb.cyl(1.0, 1.0, 0.2, 12, '#2a4a5a', { y: 0.95 });
    for (const sx of [-1, 1]) gb.box(0.2, 2.6, 0.2, '#5a3a1e', { x: sx * 1.1, y: 1.3 });
    gb.roof(2.8, 1, 2.2, '#7a3b2a', { y: 2.6 });
    gb.cyl(0.25, 0.22, 0.4, 8, '#6b4423', { y: 1.6 });
    gb.base = null;
    this.colliders.addCircle(o.x, o.z, 1.45, y0 - 2, y0 + 1.1);
  }

  b_stilthouse(o) {
    const w = 9,
      d = 8,
      h = 4.2,
      lift = 2.8;
    const y0 = this.world.heightAt(o.x, o.z);
    const gb = this.bucket(o.x, o.z);
    const gl = this.bucket(o.x, o.z, 'glow');
    const base = this.frame(o.x, y0, o.z, o.yaw);
    gb.base = gl.base = base;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(0.4, lift + 2, 0.4, '#4a3a2a', { x: (sx * w) / 2.2, y: lift / 2 - 1, z: (sz * d) / 2.2 });
    gb.box(w + 2, 0.3, d + 2, '#8a6a4a', { y: lift });
    gb.box(w, h, d, '#7a9a8a', { y: lift + h / 2 });
    gb.roof(w + 1.2, 2.2, d + 1.2, '#3a5a4a', { y: lift + h });
    gl.box(1.4, 1.1, 0.1, '#ffd98a', { x: w * 0.25, y: lift + h * 0.55, z: d / 2 + 0.05 });
    gb.box(1.5, 2.3, 0.15, '#3a2412', { x: -w * 0.2, y: lift + 1.2, z: d / 2 + 0.05 });
    // ladder
    for (let i = 0; i < 5; i++) gb.box(1.2, 0.1, 0.1, '#5a3a1e', { x: -w * 0.2, y: i * 0.6, z: d / 2 + 1.2 });
    // sluice demo
    gb.box(1.2, 0.5, 5, '#8a5a3a', { x: w / 2 + 2, y: 0.2, z: 0, rx: 0.12 });
    if (o.sign) this.sign(base, 0, lift + h + 1, d / 2 + 0.7, 6.5, o.sign, { color: '#7affea' });
    gb.base = gl.base = null;
    this.boxCollider(o, 0, 0, w / 2 + 1, d / 2 + 1, y0 - 2, y0 + lift + h + 3);
  }

  b_stall(o) {
    const y0 = this.baseY(o.x, o.z, 2.5);
    const gb = this.bucket(o.x, o.z);
    const base = this.frame(o.x, y0, o.z, o.yaw);
    gb.base = base;
    gb.box(5, 0.25, 3, '#8a6a4a', { y: 0.12 });
    gb.box(4.6, 1.05, 0.9, '#7a4f2a', { y: 0.6, z: 1.6 });
    gb.box(4.8, 0.12, 1.1, '#a0703f', { y: 1.15, z: 1.6 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) gb.box(0.18, 3, 0.18, '#5a3a1e', { x: sx * 2.3, y: 1.5, z: sz * 1.6 });
    for (let i = 0; i < 6; i++) gb.box(5.4 / 6, 0.12, 4, i % 2 ? '#ffffff' : o.color, { x: -2.7 + (5.4 / 6) * (i + 0.5), y: 3.05, z: 0, rx: 0.15 });
    for (let i = 0; i < 4; i++) gb.dodeca(0.22, ['#ffd23f', '#5fe36a', '#4aa8ff', '#ff4f7b'][i], { x: -1.4 + i * 0.9, y: 1.4, z: 1.6 });
    if (o.sign) this.sign(base, 0, 3.7, 1.8, 4.4, o.sign, { color: '#ffd23f' });
    gb.base = null;
    this.boxCollider(o, 0, 0, 2.5, 1.6, y0 - 2, y0 + 1.3);
  }

  b_boat(o) {
    const wl = this.world.waterAt(o.x, o.z);
    const y0 = wl > -900 ? wl : this.world.heightAt(o.x, o.z);
    const gb = this.bucket(o.x, o.z);
    gb.base = this.frame(o.x, y0 - 0.2, o.z, o.yaw);
    gb.box(1.8, 0.6, 4.4, '#8a5a3a', { y: 0.3 });
    gb.box(1.4, 0.1, 4, '#6b4423', { y: 0.55 });
    gb.cone(0.9, 1.2, 4, '#8a5a3a', { y: 0.3, z: 2.6, rx: Math.PI / 2, ry: Math.PI / 4, sz: 0.4 });
    gb.box(1.8, 0.1, 0.3, '#5a3a1e', { y: 0.7, z: 0.5 });
    gb.base = null;
    this.colliders.addCircle(o.x, o.z, 1.6, y0 - 2, y0 + 1);
  }

  b_beachshack(o) {
    const w = 8,
      d = 6,
      h = 3.6;
    const y0 = this.baseY(o.x, o.z, 5);
    this.footprintDrop(o, y0, 5);
    const gb = this.bucket(o.x, o.z);
    const base = this.frame(o.x, y0, o.z, o.yaw);
    gb.base = base;
    this.foundation(gb, w, d, 2, '#cdb48a');
    gb.box(w, h, d, '#5fb6c8', { y: 0.3 + h / 2 });
    gb.roof(w + 2, 1.8, d + 2, '#f2d27a', { y: 0.3 + h });
    gb.box(w * 0.6, 1.05, 1, '#e6d2a6', { y: 0.82, z: d / 2 + 2.6 });
    gb.box(w * 0.62, 0.12, 1.2, '#ffffff', { y: 1.4, z: d / 2 + 2.6 });
    for (let i = 0; i < 3; i++) gb.box(0.6, 2.4, 0.1, ['#ff6b6b', '#ffd23f', '#48dbfb'][i], { x: w / 2 + 0.6, y: 1.5, z: -1 + i * 0.9, rz: 0.15 });
    if (o.sign) this.sign(base, 0, 0.3 + h + 0.9, d / 2 + 1.2, 6, o.sign, { color: '#ff9ff3', bg: '#2a6a7a', border: '#174450' });
    gb.base = null;
    this.boxCollider(o, 0, 0, w / 2 + 0.3, d / 2 + 0.3, y0 - 3, y0 + h + 2);
    this.boxCollider(o, 0, d / 2 + 2.6, w * 0.31, 0.6, y0 - 2, y0 + 1.4);
  }

  b_umbrella(o) {
    const y0 = this.world.heightAt(o.x, o.z);
    const gb = this.bucket(o.x, o.z);
    gb.base = this.frame(o.x, y0, o.z, o.x);
    gb.cyl(0.06, 0.06, 2.6, 6, '#eeeeee', { y: 1.3, rz: 0.1 });
    gb.cone(1.8, 0.8, 8, o.color, { y: 2.7, x: 0.13 });
    gb.box(1, 0.03, 2, '#ffffff', { x: 1.2, y: 0.02, z: 0.4 });
    gb.box(1, 0.04, 2, o.color, { x: 1.2, y: 0.05, z: 0.4, sx: 0.98, sz: 0.5 });
    gb.base = null;
  }

  b_lighthouse(o) {
    const y0 = this.baseY(o.x, o.z, 5);
    const gb = this.bucket(o.x, o.z);
    const gl = this.bucket(o.x, o.z, 'glow');
    const base = this.frame(o.x, y0, o.z, 0);
    gb.base = gl.base = base;
    gb.cyl(6.2, 6.6, 1.2, 16, '#9a948c', { y: 0.3 });
    const segs = 6,
      H = 24;
    for (let i = 0; i < segs; i++) {
      const r0 = 5 - (i * 1.6) / segs,
        r1 = 5 - ((i + 1) * 1.6) / segs;
      gb.cyl(r1, r0, H / segs, 16, i % 2 ? '#d63031' : '#f5f6fa', { y: 0.9 + (H / segs) * (i + 0.5) });
    }
    gb.cyl(4.2, 4.2, 0.5, 16, '#2d3436', { y: H + 1.1 });
    gb.torus(4.1, 0.08, '#2d3436', { y: H + 2.2, rx: Math.PI / 2 });
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      gb.box(0.08, 1.1, 0.08, '#2d3436', { x: Math.cos(a) * 4.1, y: H + 1.8, z: Math.sin(a) * 4.1 });
    }
    gb.cyl(2.2, 2.2, 0.3, 12, '#2d3436', { y: H + 1.4 });
    // lamp room (gated: dark until repaired)
    const lit = this.gatedBuilder('bridge_repaired', false, 'fire');
    const dark = this.gatedBuilder('bridge_repaired', true, 'lit');
    lit.gb.base = dark.gb.base = base;
    lit.gb.cyl(2, 2, 3, 12, '#fff3b0', { y: H + 3.0 });
    dark.gb.cyl(2, 2, 3, 12, '#3a4a5a', { y: H + 3.0 });
    lit.gb.base = dark.gb.base = null;
    gb.cone(2.6, 2.2, 12, '#d63031', { y: H + 5.6 });
    gb.box(1.8, 2.8, 0.3, '#2d3436', { y: 2.3, z: 5 });
    gb.base = gl.base = null;
    this.colliders.addCircle(o.x, o.z, 5.2, y0 - 3, y0 + H + 8);
    // rotating beams
    const beamGeo = new THREE.CylinderGeometry(0.3, 6, 90, 12, 1, true);
    beamGeo.translate(0, 45, 0);
    beamGeo.rotateZ(-Math.PI / 2);
    const beamMat = new THREE.MeshBasicNodeMaterial({ color: 0xfff2a0, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    beamMat.fog = false;
    const beam = new THREE.Group();
    const b1 = new THREE.Mesh(beamGeo, beamMat);
    const b2 = new THREE.Mesh(beamGeo, beamMat);
    b2.rotation.y = Math.PI;
    beam.add(b1, b2);
    beam.position.set(o.x, y0 + H + 3, o.z);
    beam.visible = false;
    this.group.add(beam);
    this.dynamic.push({
      update: (dt, t, night) => {
        beam.visible = !!this.flagsRef?.bridge_repaired && night > 0.4;
        beam.rotation.y = t * 0.6;
      },
    });
  }

  b_bridgegate(o) {
    const y0 = this.world.heightAt(o.x, o.z);
    const g = this.gatedBuilder('bridge_repaired', true);
    g.gb.base = this.frame(o.x, y0, o.z, 1.38);
    for (const sx of [-1, 1]) g.gb.box(0.3, 1.6, 0.3, '#5a3a1e', { z: sx * 3, y: 0.8 });
    g.gb.box(0.2, 0.4, 6.4, '#f5f6fa', { y: 1.2 });
    g.gb.box(0.22, 0.4, 1, '#d63031', { y: 1.2, z: -2 });
    g.gb.box(0.22, 0.4, 1, '#d63031', { y: 1.2, z: 0 });
    g.gb.box(0.22, 0.4, 1, '#d63031', { y: 1.2, z: 2 });
    g.gb.base = null;
    const s = this.frame(o.x, y0, o.z, 1.38);
    this.sign(s, 0, 2.3, 0.2, 3.2, ['BRIDGE OUT', 'Ask the Lightkeeper'], { color: '#ff6b6b' });
    const c = this.colliders.addBox(o.x, o.z, 0.5, 3.2, 1.38, y0 - 3, y0 + 3);
    g.colliders.push(c);
  }

  b_ruins(o) {
    const y0 = this.world.heightAt(o.x, o.z);
    const gb = this.bucket(o.x, o.z);
    const sand = '#d9c08a',
      dark = '#b89a64';
    const rnd = (i) => Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
    // ring of columns, some broken
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const x = o.x + Math.cos(a) * 24,
        z = o.z + Math.sin(a) * 18;
      const yy = this.world.heightAt(x, z);
      const h = 2 + rnd(i) * 6;
      gb.cyl(0.8, 0.9, h, 8, sand, { x, y: yy + h / 2 - 0.2, z });
      gb.box(2, 0.5, 2, dark, { x, y: yy + 0.1, z });
      if (h > 6) gb.box(2.2, 0.6, 2.2, dark, { x, y: yy + h, z });
      else gb.cyl(0.8, 0.8, 1.6, 8, sand, { x: x + 1.5, y: yy + 0.5, z: z + 0.6, rz: Math.PI / 2, ry: a });
      this.colliders.addCircle(x, z, 1, yy - 2, yy + h);
    }
    // walls
    for (let i = 0; i < 5; i++) {
      const x = o.x - 10 + i * 6,
        z = o.z - 14 + (i % 2) * 3;
      const yy = this.world.heightAt(x, z);
      const h = 1.5 + rnd(i + 20) * 3;
      gb.box(5, h, 1.2, sand, { x, y: yy + h / 2 - 0.3, z, ry: 0.1 * i });
      this.colliders.addBox(x, z, 2.5, 0.6, 0.1 * i, yy - 2, yy + h);
    }
    // arch gateway
    const ax = o.x + 6,
      az = o.z + 16;
    const ay = this.world.heightAt(ax, az);
    for (const sx of [-1, 1]) {
      gb.box(1.6, 7, 1.6, sand, { x: ax + sx * 3, y: ay + 3.3, z: az });
      this.colliders.addCircle(ax + sx * 3, az, 1.1, ay - 2, ay + 7);
    }
    gb.box(8, 1.4, 1.8, dark, { x: ax, y: ay + 7.3, z: az });
    // big head statue
    const hx = o.x - 16,
      hz = o.z + 4;
    const hy = this.world.heightAt(hx, hz);
    gb.box(4, 5, 4, dark, { x: hx, y: hy + 2, z: hz, ry: 0.4 });
    gb.box(4.4, 1.2, 4.4, sand, { x: hx, y: hy + 5, z: hz, ry: 0.4 });
    gb.box(1, 0.6, 0.4, '#2a1e14', { x: hx + 1.4, y: hy + 3.2, z: hz + 1.5, ry: 0.4 });
    this.colliders.addCircle(hx, hz, 2.8, hy - 2, hy + 6);
  }

  b_dome() {
    const c = CAVERN;
    const gb = this.bucket(c.x, c.z);
    const gl = this.bucket(c.x, c.z, 'fire');
    const geo = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
    const g2 = geo.toNonIndexed();
    g2.computeVertexNormals();
    const pos = g2.attributes.position;
    const nrm = g2.attributes.normal;
    // jitter vertices for a rocky look
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i),
        y = pos.getY(i),
        z = pos.getZ(i);
      const n = 1 + Math.sin(x * 9.1 + z * 7.3) * 0.04 + Math.sin(y * 13.7 + x * 5.1) * 0.03;
      pos.setXYZ(i, x * n, y * n, z * n);
    }
    g2.computeVertexNormals();
    g2.deleteAttribute('uv');
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const v = 0.32 + (Math.sin(i * 1.7) * 0.5 + 0.5) * 0.08;
      col[i * 3] = v * 0.95;
      col[i * 3 + 1] = v * 0.88;
      col[i * 3 + 2] = v * 1.05;
    }
    g2.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const domeMat = new THREE.MeshLambertNodeMaterial({ vertexColors: true, side: THREE.DoubleSide });
    const dome = new THREE.Mesh(g2, domeMat);
    dome.scale.set(c.r + 4, c.roof - c.floor + 8, c.r + 4);
    dome.position.set(c.x, c.floor - 6, c.z);
    dome.castShadow = true;
    dome.receiveShadow = true;
    dome.name = 'cavern-dome';
    this.group.add(dome);
    this.domeMesh = dome;
    // stalactites + crystals
    const rnd = (i) => Math.abs(Math.sin(i * 78.233) * 43758.5453) % 1;
    for (let i = 0; i < 60; i++) {
      const a = rnd(i) * Math.PI * 2;
      const rr = Math.sqrt(rnd(i + 100)) * (c.r - 12);
      const x = c.x + Math.cos(a) * rr,
        z = c.z + Math.sin(a) * rr;
      const domeY = c.floor - 6 + (c.roof - c.floor + 8) * Math.sqrt(Math.max(0, 1 - (rr / (c.r + 4)) ** 2));
      const len = 3 + rnd(i + 7) * 8;
      gb.cone(0.8 + rnd(i + 3) * 1.4, len, 5, '#4a4258', { x, y: domeY - len / 2 + 1, z, rx: Math.PI });
    }
    const crystalCols = ['#7a5cff', '#22d3ff', '#ff5fd2', '#b46bff', '#5cffb0'];
    for (let i = 0; i < 70; i++) {
      const a = rnd(i + 300) * Math.PI * 2;
      const rr = 8 + Math.sqrt(rnd(i + 400)) * (c.r - 18);
      const x = c.x + Math.cos(a) * rr,
        z = c.z + Math.sin(a) * rr;
      const y = this.world.heightAt(x, z);
      if (this.world.waterAt(x, z) > y) continue;
      const s = 0.5 + rnd(i + 500) * 1.6;
      const colr = crystalCols[i % crystalCols.length];
      for (let k = 0; k < 3; k++) {
        gl.cone(0.35 * s, 2.4 * s * (1 - k * 0.2), 5, colr, { x: x + (k - 1) * 0.5 * s, y: y + 0.8 * s, z: z + ((k * 7) % 3 - 1) * 0.3 * s, rz: (k - 1) * 0.4, rx: ((k * 5) % 3 - 1) * 0.3 });
      }
      if (s > 1.2) this.colliders.addCircle(x, z, 0.8 * s, y - 2, y + 2 * s);
    }
    // glowing mushrooms / moss patches near the river
    for (let i = 0; i < 30; i++) {
      const a = rnd(i + 900) * Math.PI * 2;
      const rr = 10 + rnd(i + 950) * (c.r - 20);
      const x = c.x + Math.cos(a) * rr,
        z = c.z + Math.sin(a) * rr;
      const y = this.world.heightAt(x, z);
      gl.cyl(0.05, 0.08, 0.6, 5, '#d6f5ff', { x, y: y + 0.3, z });
      gl.sphere(0.35, '#38f2c4', { x, y: y + 0.65, z, sy: 0.45 }, 0);
    }
  }

  b_rockfall(o) {
    const y0 = this.world.heightAt(o.x, o.z);
    const g = this.gatedBuilder('cave_open', true);
    for (let i = 0; i < 14; i++) {
      const a = i * 1.7;
      g.gb.dodeca(1.6 + (i % 4) * 0.7, '#6e6a64', { x: o.x + Math.cos(a) * 4 + (i % 5) - 2, y: y0 + 1 + (i % 3) * 1.4, z: o.z + Math.sin(a) * 2, ry: i });
    }
    const c = this.colliders.addBox(o.x, o.z, 9, 3.5, 0.06, y0 - 3, y0 + 8);
    g.colliders.push(c);
    const s = this.frame(o.x, y0, o.z + 4.5, 0);
    const sg = this.gatedBuilder('cave_open', true);
    sg.gb.base = s;
    for (const sx of [-1, 1]) sg.gb.box(0.2, 2.4, 0.2, '#5a3a1e', { x: sx * 1.4, y: 1.2 });
    sg.gb.base = null;
    this.sign(s, 0, 2.0, 0.15, 3, ['DANGER', 'Rockfall! Talk to Edna'], { color: '#ff6b6b' });
  }

  b_cavemouth(o) {
    const y0 = this.world.heightAt(o.x, o.z);
    const gb = this.bucket(o.x, o.z);
    const gl = this.bucket(o.x, o.z, 'glow');
    const base = this.frame(o.x, y0, o.z, o.yaw);
    gb.base = gl.base = base;
    for (const sx of [-1, 1]) {
      gb.box(0.7, 6, 0.7, '#5a3a1e', { x: sx * 5, y: 3 });
      gl.box(0.45, 0.55, 0.45, '#ffd27a', { x: sx * 4.3, y: 4.4, z: 0.4 });
    }
    gb.box(11.5, 0.8, 0.9, '#5a3a1e', { y: 6.2 });
    this.sign(base, 0, 7.2, 0.5, 6, ['Crystal Caverns'], { color: '#cfa8ff', bg: '#3a2a4a' });
    gb.base = gl.base = null;
    for (const sx of [-1, 1]) {
      const [x, z] = this.lw(o, sx * 5, 0);
      this.colliders.addCircle(x, z, 0.5, y0 - 2, y0 + 6.5);
    }
  }

  b_altar(o) {
    const y0 = this.baseY(o.x, o.z, 3);
    const gb = this.bucket(o.x, o.z);
    const gl = this.bucket(o.x, o.z, 'fire');
    gb.base = gl.base = this.frame(o.x, y0, o.z, 0);
    gb.cyl(3.4, 3.8, 0.6, 8, '#4a4258', { y: 0.1 });
    gb.cyl(2.4, 2.8, 0.6, 8, '#5a5070', { y: 0.7 });
    gb.cyl(1, 1.3, 1.4, 8, '#6a6084', { y: 1.6 });
    gl.torus(2.6, 0.07, '#b46bff', { y: 1.05, rx: Math.PI / 2 }, 24);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      gb.box(0.6, 3.2, 0.6, '#4a4258', { x: Math.cos(a) * 3.2, y: 1.6, z: Math.sin(a) * 3.2 });
      gl.cone(0.3, 0.9, 5, '#7affea', { x: Math.cos(a) * 3.2, y: 3.6, z: Math.sin(a) * 3.2 });
    }
    gb.base = gl.base = null;
    this.colliders.addCircle(o.x, o.z, 1.6, y0 - 2, y0 + 2.4);
    // floating crystal
    const cg = new THREE.OctahedronGeometry(0.8, 0);
    const cm = new THREE.MeshBasicNodeMaterial();
    cm.colorNode = mix(vec3(0.48, 1.0, 0.7), vec3(0.75, 0.42, 1.0), sin(time.mul(1.5)).mul(0.5).add(0.5));
    const crystal = new THREE.Mesh(cg, cm);
    crystal.scale.set(1, 1.6, 1);
    crystal.position.set(o.x, y0 + 3.5, o.z);
    this.group.add(crystal);
    this.altarPos = { x: o.x, y: y0 + 3.5, z: o.z };
    this.dynamic.push({
      update: (dt, t) => {
        crystal.position.y = y0 + 3.5 + Math.sin(t * 1.4) * 0.3;
        crystal.rotation.y = t * 0.8;
      },
    });
  }

  b_flag(o) {
    const y0 = this.world.heightAt(o.x, o.z);
    const gb = this.bucket(o.x, o.z);
    gb.base = this.frame(o.x, y0, o.z, 0);
    for (let i = 0; i < 7; i++) gb.dodeca(0.6 - i * 0.05, '#7d7a76', { x: Math.cos(i) * 0.6, y: 0.3 + i * 0.35, z: Math.sin(i) * 0.6 });
    gb.cyl(0.06, 0.06, 5, 6, '#ccc', { y: 2.5 });
    gb.box(2, 1.2, 0.05, '#d63031', { x: 1, y: 4.4 });
    gb.base = null;
    this.colliders.addCircle(o.x, o.z, 1, y0 - 2, y0 + 2.5);
  }

  b_temple(o) {
    const y0 = this.minY(o.x, o.z, 6);
    const gb = this.bucket(o.x, o.z);
    const gl = this.bucket(o.x, o.z, 'fire');
    const base = this.frame(o.x, y0, o.z, o.yaw);
    gb.base = gl.base = base;
    const ob = '#2a2433',
      tr = '#ff7a1a';
    gb.box(14, 6, 14, ob, { y: -1 });
    gb.box(10, 2, 10, '#3a3044', { y: 3 });
    gb.box(6.5, 2, 6.5, ob, { y: 5 });
    for (const y of [2.05, 4.05, 6.05]) gl.box(y === 2.05 ? 14.1 : y === 4.05 ? 10.1 : 6.6, 0.12, 0.1, tr, { y, z: y === 2.05 ? 7.02 : y === 4.05 ? 5.02 : 3.27 });
    gb.box(3, 6, 6, '#3a3044', { y: 2, z: 6.5, rx: 0.6 });
    gb.cyl(1.2, 1.5, 1.2, 8, '#4a3a2a', { y: 6.6 });
    gl.sphere(0.8, '#ff6a1a', { y: 7.3, sy: 0.6 }, 0);
    gb.base = gl.base = null;
    this.boxCollider(o, 0, 0, 7, 7, y0 - 5, y0 + 2.2);
    const [fx, fz] = this.lw(o, 0, 0);
    this.flames.push({ x: fx, y: y0 + 7.1, z: fz, s: 1.6 });
    const plat = this.boxCollider(o, 0, 0, 5, 5, y0 + 3.5, y0 + 4);
    plat.platform = true;
  }

  b_lavagate(o) {
    const y0 = this.world.heightAt(o.x, o.z);
    const g = this.gatedBuilder('infernal_access', true, 'fire');
    const gs = this.gatedBuilder('infernal_access', true);
    const base = this.frame(o.x, y0, o.z, o.yaw);
    g.gb.base = gs.gb.base = base;
    for (const sx of [-1, 1]) gs.gb.box(1.4, 8, 1.4, '#2a2433', { x: sx * 4.5, y: 4 });
    gs.gb.box(10.5, 1.4, 1.6, '#2a2433', { y: 8.4 });
    g.gb.box(7.6, 7.6, 0.25, '#ff4a1c', { y: 4 });
    g.gb.base = gs.gb.base = null;
    const c = this.colliders.addBox(o.x, o.z, 5.2, 0.8, o.yaw, y0 - 4, y0 + 9);
    g.colliders.push(c);
    this.sign(this.frame(o.x, y0, o.z, o.yaw), 0, 10.3, 0.9, 5, ['Infernal Heart', 'Sealed by the Flame Priest'], { color: '#ff7a1a', bg: '#2a1410' });
  }
}
