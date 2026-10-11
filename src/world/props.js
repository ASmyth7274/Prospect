// Vegetation & rock scatter. Big props (trees/rocks) are one InstancedMesh per kind for the whole
// map; small ground props (grass, flowers, bushes, reeds) are bucketed so they can be distance-culled.
import * as THREE from 'three/webgpu';
import { positionLocal, positionGeometry, time, sin, cos, vec3, float, vertexColor } from 'three/tsl';
import { GeoBuilder } from './geobuilder.js';
import { mulberry32, smoothstep } from './noise.js';
import { SCATTER, TOWNS } from '../data/places.js';
import { PATHS, CAVERN, CALDERA } from './layout.js';
import { closestOnPolyline } from './worldgen.js';

const SMALL_BUCKET = 300;
const BIG_BUCKET = 400;

function proto(kind) {
  const g = new GeoBuilder();
  switch (kind) {
    case 'tree':
      g.cyl(0.22, 0.34, 3.2, 6, '#6b4a2e', { y: 1.6 });
      g.sphere(1.9, '#4f8f3a', { y: 4.2 }, 0);
      g.sphere(1.5, '#5aa043', { x: 1.0, y: 4.9, z: 0.4 }, 0);
      g.sphere(1.4, '#478535', { x: -0.9, y: 4.6, z: -0.5 }, 0);
      g.sphere(1.2, '#62ab4a', { y: 5.9 }, 0);
      break;
    case 'pine':
      g.cyl(0.18, 0.3, 2.2, 6, '#5a3d24', { y: 1.1 });
      g.cone(2.2, 3.2, 7, '#2f6b3a', { y: 3.2 });
      g.cone(1.7, 2.8, 7, '#357a42', { y: 4.9 });
      g.cone(1.1, 2.4, 7, '#3c8549', { y: 6.5 });
      break;
    case 'snowpine':
      g.cyl(0.18, 0.3, 2.2, 6, '#5a3d24', { y: 1.1 });
      g.cone(2.2, 3.2, 7, '#2f5a45', { y: 3.2 });
      g.cone(1.85, 1.1, 7, '#f2f7ff', { y: 4.2 });
      g.cone(1.7, 2.8, 7, '#2f5a45', { y: 4.9 });
      g.cone(1.3, 1.0, 7, '#f2f7ff', { y: 5.9 });
      g.cone(1.1, 2.4, 7, '#f2f7ff', { y: 6.5 });
      break;
    case 'palm': {
      let x = 0,
        y = 0;
      for (let i = 0; i < 6; i++) {
        g.cyl(0.2 - i * 0.015, 0.24 - i * 0.015, 1.1, 6, i % 2 ? '#8a6a44' : '#7a5a38', { x, y: y + 0.55, rz: -0.12 });
        x += 0.13;
        y += 1.05;
      }
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        g.box(2.8, 0.06, 0.7, '#3f9a3a', { x: x + Math.cos(a) * 1.3, y: y - 0.25, z: Math.sin(a) * 1.3, ry: -a, rz: -0.45 });
      }
      for (let i = 0; i < 3; i++) g.sphere(0.2, '#5a3d1e', { x: x + Math.cos(i * 2) * 0.3, y: y - 0.3, z: Math.sin(i * 2) * 0.3 }, 0);
      break;
    }
    case 'cactus':
      g.cyl(0.38, 0.42, 3.6, 7, '#4f8a3a', { y: 1.8 });
      g.sphere(0.38, '#4f8a3a', { y: 3.6 }, 0);
      g.cyl(0.24, 0.24, 1.0, 6, '#4f8a3a', { x: 0.6, y: 1.6, rz: Math.PI / 2 });
      g.cyl(0.24, 0.24, 1.3, 6, '#4f8a3a', { x: 1.05, y: 2.2 });
      g.cyl(0.22, 0.22, 0.8, 6, '#4f8a3a', { x: -0.5, y: 2.2, rz: Math.PI / 2 });
      g.cyl(0.22, 0.22, 1.0, 6, '#4f8a3a', { x: -0.85, y: 2.7 });
      g.sphere(0.15, '#ff6b9a', { y: 3.95 }, 0);
      break;
    case 'deadtree':
      g.cyl(0.14, 0.3, 4, 5, '#5b4b3f', { y: 2 });
      g.cyl(0.07, 0.12, 2, 4, '#5b4b3f', { x: 0.6, y: 3.3, rz: -0.8 });
      g.cyl(0.07, 0.12, 1.6, 4, '#5b4b3f', { x: -0.5, y: 2.8, rz: 0.9 });
      g.cyl(0.05, 0.09, 1.4, 4, '#5b4b3f', { z: 0.5, y: 3.9, rx: 0.8 });
      break;
    case 'bush':
      g.sphere(0.8, '#4c8a3c', { y: 0.5 }, 0);
      g.sphere(0.6, '#5a9c45', { x: 0.6, y: 0.4, z: 0.2 }, 0);
      g.sphere(0.55, '#457f36', { x: -0.5, y: 0.35, z: -0.3 }, 0);
      break;
    case 'rock':
      g.dodeca(1, '#8b8680', { y: 0.25, sy: 0.65 });
      break;
    case 'rock2':
      g.dodeca(0.8, '#858079', { y: 0.2, sx: 1.3, sy: 0.55 });
      g.dodeca(0.5, '#918c86', { x: 0.8, y: 0.15, z: 0.3, sy: 0.6 });
      break;
    case 'grass':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        g.cone(0.07, 0.75, 3, i % 2 ? '#6fae3f' : '#5c9c36', { x: Math.cos(a) * 0.12, y: 0.35, z: Math.sin(a) * 0.12, rx: Math.sin(a) * 0.35, rz: -Math.cos(a) * 0.35 });
      }
      break;
    case 'flower':
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        g.cyl(0.02, 0.02, 0.45, 3, '#4a8a30', { x: Math.cos(a) * 0.18, y: 0.22, z: Math.sin(a) * 0.18 });
        g.sphere(0.11, '#ffffff', { x: Math.cos(a) * 0.18, y: 0.48, z: Math.sin(a) * 0.18 }, 0);
      }
      break;
    case 'reed':
      for (let i = 0; i < 6; i++) {
        const a = i * 1.9;
        g.cyl(0.03, 0.04, 1.8, 3, '#7a8a3a', { x: Math.cos(a) * 0.25, y: 0.9, z: Math.sin(a) * 0.25, rz: Math.cos(a) * 0.1 });
        if (i % 2) g.cyl(0.07, 0.07, 0.35, 5, '#6b4423', { x: Math.cos(a) * 0.25, y: 1.7, z: Math.sin(a) * 0.25 });
      }
      break;
    case 'shell':
      g.cone(0.25, 0.18, 6, '#ffe2cc', { y: 0.05, rx: 0.3 });
      break;
    case 'ember':
      g.dodeca(0.6, '#3a2a24', { y: 0.2, sy: 0.6 });
      g.dodeca(0.25, '#ff6a1a', { y: 0.45 });
      break;
    default:
      g.box(1, 1, 1, '#ff00ff', { y: 0.5 });
  }
  return g.toGeometry();
}

const BIG = ['tree', 'pine', 'snowpine', 'palm', 'cactus', 'deadtree', 'rock', 'rock2', 'ember'];
const SMALL = ['grass', 'flower', 'bush', 'reed', 'shell'];
const COLLIDE = { tree: 0.45, pine: 0.4, snowpine: 0.4, palm: 0.35, cactus: 0.5, deadtree: 0.35 };
const FLOWER_COLS = ['#ff6b9a', '#ffd23f', '#b46bff', '#ffffff', '#ff8a3c', '#6cc0ff'];

export class Props {
  constructor(world, scene, colliders, quality) {
    this.world = world;
    this.scene = scene;
    this.colliders = colliders;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'props';
    scene.add(this.group);
    this.smallBuckets = [];
  }

  makeMaterial(kind) {
    const mat = new THREE.MeshLambertNodeMaterial({ vertexColors: true });
    const sway = { tree: 0.035, pine: 0.025, snowpine: 0.02, palm: 0.05, grass: 0.12, flower: 0.1, reed: 0.1, bush: 0.03 }[kind];
    if (sway) {
      const h = positionGeometry.y;
      const ph = positionLocal.x.mul(0.07).add(positionLocal.z.mul(0.09));
      const t = time.mul(1.6);
      const off = vec3(sin(t.add(ph)).mul(h).mul(sway), float(0), cos(t.mul(0.8).add(ph)).mul(h).mul(sway * 0.6));
      mat.positionNode = positionLocal.add(off);
    }
    if (kind === 'ember') {
      const e = new THREE.MeshBasicNodeMaterial({ vertexColors: true });
      e.colorNode = vertexColor().rgb.mul(sin(time.mul(2).add(positionLocal.x)).mul(0.2).add(1.1));
      return e;
    }
    return mat;
  }

  excluded(x, z, kind) {
    const w = this.world;
    // towns
    for (const t of TOWNS) {
      const d = Math.hypot(x - t.x, z - t.z);
      if (d < (BIG.includes(kind) ? 34 : 14)) return true;
    }
    // paths
    for (const p of PATHS) {
      if (Math.abs(x - p.pts[0][0]) > 200 && Math.abs(z - p.pts[0][1]) > 250) continue;
      const c = closestOnPolyline(p.pts, x, z);
      if (c.d < c.hw + 2) return true;
    }
    // dig sites
    const sd = w.siteShapeDist(x, z);
    if (sd.edge < (BIG.includes(kind) ? 4 : 0.5)) return true;
    // cavern interior handled elsewhere
    if (Math.hypot(x - CAVERN.x, z - CAVERN.z) < CAVERN.r + 6) return true;
    // caldera crater + bridge corridor
    if (Math.hypot(x - CALDERA.x, z - CALDERA.z) < CALDERA.craterR + 6) return true;
    for (const d of w.decks) {
      const dx = x - d.x,
        dz = z - d.z;
      if (Math.abs(dx * d.cos - dz * d.sin) < d.len / 2 + 3 && Math.abs(dx * d.sin + dz * d.cos) < d.wid / 2 + 3) return true;
    }
    return false;
  }

  build() {
    const w = this.world;
    const rand = mulberry32(4242);
    const q = this.quality;
    const big = Object.fromEntries(BIG.map((k) => [k, []]));
    const smallBuckets = new Map();
    const CELL = 4;
    const half = w.half - 4;
    const tmpOut = { x: 0, z: 0, hit: false };
    const nrm = { x: 0, y: 1, z: 0 };
    for (let z = -half; z < half; z += CELL) {
      for (let x = -half; x < half; x += CELL) {
        const px = x + rand() * CELL;
        const pz = z + rand() * CELL;
        const h = w.heightAt(px, pz);
        if (h < 0.3) continue;
        const biome = w.biomeAt(px, pz);
        const dens = SCATTER[biome];
        if (!dens) continue;
        const wl = w.waterAt(px, pz);
        const wet = wl > h - 0.25;
        w.normalAt(px, pz, nrm);
        for (const kind in dens) {
          let p = dens[kind] * ((CELL * CELL) / 1000);
          if (SMALL.includes(kind) || kind === 'bush') p *= kind === 'grass' ? q.grass : q.props;
          else p *= 0.5 + 0.5 * q.props;
          if (rand() > p) continue;
          let k = kind;
          if (k === 'rock' && rand() < 0.4) k = 'rock2';
          if (wet && k !== 'reed') continue;
          if (k === 'reed' && !(wl > -900 && wl - h < 0.6 && wl - h > -1.2)) continue;
          const steep = nrm.y < 0.8;
          if (steep && !(k === 'rock' || k === 'rock2')) continue;
          if (h > 112 && !(k === 'rock' || k === 'rock2' || k === 'snowpine')) continue;
          if (this.excluded(px, pz, k)) continue;
          const isBig = BIG.includes(k);
          const s = k === 'rock' || k === 'rock2' ? 0.6 + rand() * rand() * 3.2 : 0.75 + rand() * 0.6;
          if (isBig) {
            const cr = (COLLIDE[k] || (k.startsWith('rock') ? 0.8 : 0)) * s;
            if (cr) {
              this.colliders.resolve(px, pz, cr, h, 2, tmpOut);
              if (tmpOut.hit) continue;
            }
          }
          const inst = { x: px, y: h - (k.startsWith('rock') ? 0.25 * s : 0.05), z: pz, s, yaw: rand() * Math.PI * 2, tint: this.tintFor(k, biome, rand, h) };
          if (k.startsWith('rock')) {
            inst.sx = s * (0.8 + rand() * 0.6);
            inst.sz = s * (0.8 + rand() * 0.6);
          }
          if (isBig) {
            big[k].push(inst);
            const cr = (COLLIDE[k] || (k.startsWith('rock') ? 0.85 : 0)) * s;
            if (cr) this.colliders.addCircle(px, pz, cr, h - 2, h + (k.startsWith('rock') ? 0.9 * s : 8));
          } else {
            const key = `${Math.floor(px / SMALL_BUCKET)}:${Math.floor(pz / SMALL_BUCKET)}`;
            let b = smallBuckets.get(key);
            if (!b) smallBuckets.set(key, (b = { cx: (Math.floor(px / SMALL_BUCKET) + 0.5) * SMALL_BUCKET, cz: (Math.floor(pz / SMALL_BUCKET) + 0.5) * SMALL_BUCKET, kinds: {} }));
            (b.kinds[k] ||= []).push(inst);
          }
        }
      }
    }
    // river rocks
    for (const r of w.rivers) {
      if (r.lava || r.cave) continue;
      for (let i = 0; i < r.pts.length - 1; i += 2) {
        const p = r.pts[i];
        if (rand() > 0.5) continue;
        const side = rand() < 0.5 ? -1 : 1;
        const q2 = r.pts[i + 1];
        const dx = q2[0] - p[0],
          dz = q2[1] - p[1];
        const len = Math.hypot(dx, dz) || 1;
        const x = p[0] + (-dz / len) * side * p[3] * (0.85 + rand() * 0.4);
        const z = p[1] + (dx / len) * side * p[3] * (0.85 + rand() * 0.4);
        if (this.excluded(x, z, 'rock')) continue;
        const s = 0.7 + rand() * 1.3;
        big.rock.push({ x, y: w.heightAt(x, z) - 0.2, z, s, sx: s * 1.3, sz: s, yaw: rand() * 6, tint: [0.85, 0.85, 0.85] });
      }
    }
    // big props are bucketed too (frustum + distance culled per bucket)
    const bigBuckets = new Map();
    for (const k of BIG) {
      for (const it of big[k]) {
        const key = `${Math.floor(it.x / BIG_BUCKET)}:${Math.floor(it.z / BIG_BUCKET)}`;
        let b = bigBuckets.get(key);
        if (!b) bigBuckets.set(key, (b = { cx: (Math.floor(it.x / BIG_BUCKET) + 0.5) * BIG_BUCKET, cz: (Math.floor(it.z / BIG_BUCKET) + 0.5) * BIG_BUCKET, kinds: {} }));
        (b.kinds[k] ||= []).push(it);
      }
    }
    const m = new THREE.Matrix4();
    const qn = new THREE.Quaternion();
    const v = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const c = new THREE.Color();
    const protos = {};
    const mats = {};
    const makeBuckets = (map, size, isBig, out) => {
      for (const [, b] of map) {
        const bucket = { cx: b.cx, cz: b.cz, size, meshes: [] };
        for (const k in b.kinds) {
          const list = b.kinds[k];
          protos[k] ||= proto(k);
          mats[k] ||= this.makeMaterial(k);
          const mesh = new THREE.InstancedMesh(protos[k], mats[k], list.length);
          list.forEach((it, i) => {
            qn.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.yaw);
            if (k.startsWith('rock')) sc.set(it.sx ?? it.s, it.s * 0.9, it.sz ?? it.s);
            else sc.setScalar(it.s);
            m.compose(v.set(it.x, it.y, it.z), qn, sc);
            mesh.setMatrixAt(i, m);
            mesh.setColorAt(i, c.setRGB(it.tint[0], it.tint[1], it.tint[2]));
          });
          mesh.computeBoundingSphere();
          mesh.castShadow = isBig && k !== 'ember';
          mesh.receiveShadow = true;
          mesh.name = (isBig ? 'big-' : 'small-') + k;
          this.group.add(mesh);
          bucket.meshes.push(mesh);
        }
        out.push(bucket);
      }
    };
    this.bigBuckets = [];
    makeBuckets(bigBuckets, BIG_BUCKET, true, this.bigBuckets);
    makeBuckets(smallBuckets, SMALL_BUCKET, false, this.smallBuckets);
    this.counts = Object.fromEntries(Object.entries(big).map(([k, l]) => [k, l.length]));
  }

  tintFor(k, biome, rand, h) {
    const j = 0.88 + rand() * 0.24;
    if (k === 'flower') {
      const col = new THREE.Color(FLOWER_COLS[Math.floor(rand() * FLOWER_COLS.length)]);
      return [col.r, col.g, col.b];
    }
    if (k === 'rock' || k === 'rock2') {
      if (biome === 'desert' || biome === 'mesa') return [1.15 * j, 0.82 * j, 0.62 * j];
      if (biome === 'volcano') return [0.38 * j, 0.34 * j, 0.36 * j];
      if (biome === 'snow' || h > 100) return [1.05 * j, 1.08 * j, 1.15 * j];
      if (biome === 'beach') return [1.1 * j, 1.05 * j, 0.95 * j];
      return [j, j, j];
    }
    if (biome === 'desert' || biome === 'mesa') return [1.1 * j, 1.0 * j, 0.7 * j];
    if (biome === 'wetland') return [0.9 * j, 1.0 * j, 0.85 * j];
    if (biome === 'mountain' && h > 70) return [0.85 * j, 0.95 * j, 0.95 * j];
    if (k === 'tree' && rand() < 0.15) return [1.35 * j, 1.0 * j, 0.45 * j]; // autumn
    return [j, j * (0.95 + rand() * 0.1), j];
  }

  update(camPos, smallDist, bigDist) {
    const vis = (b, dist) => {
      const dx = Math.max(Math.abs(camPos.x - b.cx) - b.size / 2, 0);
      const dz = Math.max(Math.abs(camPos.z - b.cz) - b.size / 2, 0);
      return Math.hypot(dx, dz) < dist;
    };
    for (const b of this.smallBuckets) {
      const v = vis(b, smallDist);
      for (const m of b.meshes) m.visible = v;
    }
    for (const b of this.bigBuckets) {
      const v = vis(b, bigDist);
      // only nearby buckets render into the shadow map (shadow frustum follows the player)
      const sh = vis(b, 90);
      for (const m of b.meshes) {
        m.visible = v;
        if (m.name !== 'big-ember') m.castShadow = sh;
      }
    }
  }
}
