// All water bodies (ocean grid, river ribbons, lake discs) merged into ONE mesh / draw call,
// shaded with a custom unlit TSL material (normal-mapped reflections, depth tint, shore foam).
// Lava is a second mesh with an emissive flowing material.
import * as THREE from 'three/webgpu';
import {
  texture,
  positionWorld,
  attribute,
  vec2,
  vec3,
  float,
  mix,
  smoothstep,
  normalize,
  dot,
  max,
  pow,
  reflect,
  cameraPosition,
  uniform,
  time,
  clamp,
  sin,
} from 'three/tsl';
import { LAKES, LAVA_LAKES, WORLD_HALF } from './layout.js';

function pushQuad(arrs, a, b, c, d) {
  arrs.index.push(a, c, b, b, c, d);
}

export class Water {
  constructor(world, scene, normalTex, detailTex, env) {
    this.world = world;
    this.scene = scene;
    this.env = env; // shared lighting uniforms
    this.uniforms = {
      rapids: uniform(1),
      deep: uniform(new THREE.Color(0.05, 0.24, 0.36)),
      shallow: uniform(new THREE.Color(0.2, 0.58, 0.62)),
    };
    const geo = this.buildWaterGeometry();
    this.mesh = new THREE.Mesh(geo, this.makeMaterial(normalTex));
    this.mesh.name = 'water';
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    const lavaGeo = this.buildLavaGeometry();
    this.lava = new THREE.Mesh(lavaGeo, this.makeLavaMaterial(detailTex));
    this.lava.name = 'lava';
    scene.add(this.lava);
  }

  buildWaterGeometry() {
    const w = this.world;
    const P = [];
    const D = [];
    const F = [];
    const K = [];
    const arrs = { index: [] };
    const add = (x, y, z, depth, fx, fz, kind) => {
      P.push(x, y, z);
      D.push(depth);
      F.push(fx, fz);
      K.push(kind);
      return P.length / 3 - 1;
    };

    // --- ocean grid (skip quads fully on land) ---
    const S = 8;
    const nn = Math.round((WORLD_HALF * 2) / S) + 1;
    const vid = new Int32Array(nn * nn).fill(-1);
    const getV = (i, j) => {
      const k = j * nn + i;
      if (vid[k] >= 0) return vid[k];
      const x = i * S - WORLD_HALF;
      const z = j * S - WORLD_HALF;
      const h = w.heightAt(x, z);
      vid[k] = add(x, -0.03, z, Math.max(-2, -h), 0.25, 0.12, 0);
      return vid[k];
    };
    for (let j = 0; j < nn - 1; j++) {
      for (let i = 0; i < nn - 1; i++) {
        const x0 = i * S - WORLD_HALF,
          z0 = j * S - WORLD_HALF;
        const hmin = Math.min(w.heightAt(x0, z0), w.heightAt(x0 + S, z0), w.heightAt(x0, z0 + S), w.heightAt(x0 + S, z0 + S), w.heightAt(x0 + S / 2, z0 + S / 2));
        if (hmin > 0.6) continue;
        pushQuad(arrs, getV(i, j), getV(i + 1, j), getV(i, j + 1), getV(i + 1, j + 1));
      }
    }
    // outer ocean skirt to the horizon
    const E = WORLD_HALF,
      F2 = 6000;
    const ring = [
      [-F2, -F2, F2, -E],
      [-F2, E, F2, F2],
      [-F2, -E, -E, E],
      [E, -E, F2, E],
    ];
    for (const [x0, z0, x1, z1] of ring) {
      const a = add(x0, -0.03, z0, 40, 0.25, 0.12, 0);
      const b = add(x1, -0.03, z0, 40, 0.25, 0.12, 0);
      const c = add(x0, -0.03, z1, 40, 0.25, 0.12, 0);
      const d = add(x1, -0.03, z1, 40, 0.25, 0.12, 0);
      pushQuad(arrs, a, b, c, d);
    }

    // --- rivers ---
    for (const r of w.rivers) {
      if (r.lava) continue;
      const pts = r.pts;
      // resample at ~3m
      const samples = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i],
          b = pts[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const steps = Math.max(1, Math.ceil(len / 3));
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          samples.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t]);
        }
      }
      samples.push(pts[pts.length - 1]);
      const across = 7;
      let prevRow = null;
      for (let s = 0; s < samples.length; s++) {
        const p = samples[s];
        const q = samples[Math.min(samples.length - 1, s + 1)];
        const o = samples[Math.max(0, s - 1)];
        let dx = q[0] - o[0],
          dz = q[1] - o[1];
        const len = Math.hypot(dx, dz) || 1;
        dx /= len;
        dz /= len;
        const nx = -dz,
          nz = dx;
        const drop = Math.abs(q[2] - o[2]) / (Math.hypot(q[0] - o[0], q[1] - o[1]) || 1);
        const fall = drop > 0.6;
        const speed = r.flow * (fall ? 6 : 1);
        const halfW = p[3] + 2.2;
        const row = [];
        for (let a = 0; a < across; a++) {
          const t = (a / (across - 1)) * 2 - 1;
          const x = p[0] + nx * halfW * t;
          const z = p[1] + nz * halfW * t;
          const h = w.heightAt(x, z);
          row.push(add(x, p[2], z, p[2] - h, dx * speed, dz * speed, fall ? 3 : 1));
        }
        if (prevRow) {
          for (let a = 0; a < across - 1; a++) pushQuad(arrs, prevRow[a], prevRow[a + 1], row[a], row[a + 1]);
        }
        prevRow = row;
      }
    }

    // --- lakes ---
    for (const L of LAKES) {
      const segs = 40;
      const radii = [0, 0.35, 0.65, 0.88, 1.0, 1.15];
      const rows = radii.map((rf) => {
        const row = [];
        for (let sgi = 0; sgi < segs; sgi++) {
          const ang = (sgi / segs) * Math.PI * 2;
          const rr = (L.r + 2.5) * rf;
          const x = L.x + Math.cos(ang) * rr;
          const z = L.z + Math.sin(ang) * rr;
          const h = w.heightAt(x, z);
          row.push(add(x, L.level, z, L.level - h, L.hot ? 0.05 : 0.08, L.hot ? 0.05 : 0.03, L.hot ? 2 : 1));
          if (rf === 0) break;
        }
        return row;
      });
      for (let ri = 0; ri < rows.length - 1; ri++) {
        const A = rows[ri],
          B = rows[ri + 1];
        for (let sgi = 0; sgi < segs; sgi++) {
          const b0 = B[sgi],
            b1 = B[(sgi + 1) % segs];
          if (A.length === 1) arrs.index.push(A[0], b1, b0);
          else {
            const a0 = A[sgi],
              a1 = A[(sgi + 1) % segs];
            arrs.index.push(a0, b1, b0, a0, a1, b1);
          }
        }
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('wdepth', new THREE.Float32BufferAttribute(D, 1));
    g.setAttribute('wflow', new THREE.Float32BufferAttribute(F, 2));
    g.setAttribute('wkind', new THREE.Float32BufferAttribute(K, 1));
    g.setIndex(P.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(arrs.index, 1) : new THREE.Uint16BufferAttribute(arrs.index, 1));
    g.computeBoundingSphere();
    return g;
  }

  buildLavaGeometry() {
    const w = this.world;
    const P = [];
    const F = [];
    const idx = [];
    const add = (x, y, z, fx, fz) => {
      P.push(x, y, z);
      F.push(fx, fz);
      return P.length / 3 - 1;
    };
    for (const r of w.rivers) {
      if (!r.lava) continue;
      let prev = null;
      const pts = r.pts;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[Math.min(pts.length - 1, i + 1)];
        const o = pts[Math.max(0, i - 1)];
        let dx = q[0] - o[0],
          dz = q[1] - o[1];
        const len = Math.hypot(dx, dz) || 1;
        dx /= len;
        dz /= len;
        const nx = -dz,
          nz = dx;
        const hw = p[3] + 1.5;
        const row = [add(p[0] - nx * hw, p[2], p[1] - nz * hw, dx, dz), add(p[0], p[2], p[1], dx, dz), add(p[0] + nx * hw, p[2], p[1] + nz * hw, dx, dz)];
        if (prev) {
          idx.push(prev[0], row[0], prev[1], prev[1], row[0], row[1]);
          idx.push(prev[1], row[1], prev[2], prev[2], row[1], row[2]);
        }
        prev = row;
      }
    }
    for (const L of LAVA_LAKES) {
      const segs = 32;
      const c = add(L.x, L.level, L.z, 0.1, 0.05);
      const first = P.length / 3;
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        add(L.x + Math.cos(a) * (L.r + 2), L.level, L.z + Math.sin(a) * (L.r + 2), 0.1, 0.05);
      }
      for (let s = 0; s < segs; s++) idx.push(c, first + ((s + 1) % segs), first + s);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('wflow', new THREE.Float32BufferAttribute(F, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  }

  makeMaterial(normalTex) {
    const env = this.env;
    const U = this.uniforms;
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.transparent = true;
    mat.depthWrite = false;
    mat.side = THREE.DoubleSide;

    const depth = attribute('wdepth', 'float');
    const flow = attribute('wflow', 'vec2');
    const kind = attribute('wkind', 'float');
    const p = positionWorld.xz;
    const t = time.mul(U.rapids);
    const uv1 = p.mul(0.045).sub(flow.mul(t).mul(0.06));
    const uv2 = p.mul(0.083).mul(vec2(-1, 1)).add(vec2(t.mul(0.011), t.mul(0.017))).sub(flow.mul(t).mul(0.09));
    const s1 = texture(normalTex, uv1);
    const s2 = texture(normalTex, uv2);
    const nxz = s1.xy.add(s2.xy).sub(1.0);
    const waveStrength = mix(float(1.4), float(3.0), smoothstep(2.5, 3.5, kind)); // waterfalls choppier
    const n = normalize(vec3(nxz.x.mul(waveStrength), 2.2, nxz.y.mul(waveStrength)));
    const V = normalize(cameraPosition.sub(positionWorld));
    const ndv = max(dot(n, V), 0.0);
    const fres = pow(float(1).sub(ndv), 4).mul(0.65).add(0.04);
    const R = reflect(V.negate(), n);
    const spec = pow(max(dot(R, env.sunDir), 0.0), 180).mul(env.sunSpec);
    const deepT = smoothstep(0.2, 5.0, depth);
    const hot = smoothstep(1.5, 2.5, kind).mul(float(1).sub(smoothstep(2.5, 3.5, kind)));
    const base = mix(U.shallow, U.deep, deepT);
    const hotTint = mix(base, vec3(0.32, 0.72, 0.7), hot);
    const lit = hotTint.mul(env.ambient);
    const foamMask = smoothstep(0.55, 0.0, depth).mul(smoothstep(0.35, 0.75, s1.w.add(s2.w).mul(0.5).add(sin(time.mul(1.3).add(p.x.mul(0.1))).mul(0.08))));
    const fallFoam = smoothstep(2.5, 3.5, kind).mul(smoothstep(0.3, 0.7, s1.w));
    const foam = clamp(foamMask.add(fallFoam), 0, 1);
    const sky = env.skyReflect;
    const col = mix(lit, sky, fres).add(env.sunColor.mul(spec)).add(vec3(foam).mul(env.ambient).mul(0.85));
    mat.colorNode = col;
    const alpha = clamp(mix(float(0.45), float(0.93), smoothstep(0.0, 3.0, depth)).add(fres.mul(0.3)).add(foam.mul(0.5)), 0.0, 1.0);
    // fade out at the very edge to soften shorelines
    mat.opacityNode = alpha.mul(smoothstep(-0.05, 0.12, depth));
    return mat;
  }

  makeLavaMaterial(detailTex) {
    const mat = new THREE.MeshBasicNodeMaterial();
    const flow = attribute('wflow', 'vec2');
    const p = positionWorld.xz;
    const uv = p.mul(0.022).sub(flow.mul(time).mul(0.012));
    const n1 = texture(detailTex, uv).r;
    const n2 = texture(detailTex, uv.mul(1.7).add(vec2(time.mul(0.006), time.mul(-0.004)))).r;
    const heat = smoothstep(0.38, 0.78, n1.mul(0.65).add(n2.mul(0.45)));
    const crust = vec3(0.13, 0.03, 0.02);
    const hot = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.86, 0.32), heat);
    const pulse = sin(time.mul(1.7).add(p.x.mul(0.05))).mul(0.08).add(1.0);
    mat.colorNode = mix(crust, hot, smoothstep(0.15, 0.6, heat)).mul(pulse);
    return mat;
  }
}
