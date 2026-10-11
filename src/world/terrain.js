// Chunked terrain with 3 LODs and skirts. One draw call per visible chunk; geometries per LOD
// share a single index buffer. Material is a cheap Lambert node material with a detail texture.
import * as THREE from 'three/webgpu';
import { texture, positionWorld, vertexColor, vec2, float, mix, smoothstep, uniform } from 'three/tsl';

const CHUNK_CELLS = 50;
const LOD_STEPS = [1, 2, 5];
const SKIRT = 6;

function buildIndex(q, skirtBase) {
  // q = quads per side
  const v = q + 1;
  const idx = [];
  for (let j = 0; j < q; j++) {
    for (let i = 0; i < q; i++) {
      const a = j * v + i;
      const b = a + 1;
      const c = a + v;
      const d = c + 1;
      // split diagonal b-c (matches WorldData.heightAt)
      idx.push(a, c, b, b, c, d);
    }
  }
  // skirts: 4 edges, each edge has v skirt vertices starting at skirtBase + e*v
  const edges = [
    (k) => k, // top row j=0
    (k) => q * v + k, // bottom row j=q
    (k) => k * v, // left col i=0
    (k) => k * v + q, // right col i=q
  ];
  for (let e = 0; e < 4; e++) {
    for (let k = 0; k < q; k++) {
      const t0 = edges[e](k);
      const t1 = edges[e](k + 1);
      const s0 = skirtBase + e * v + k;
      const s1 = s0 + 1;
      // double-sided-ish: emit both windings so skirts show from either side
      idx.push(t0, s0, t1, t1, s0, s1);
      idx.push(t0, t1, s0, t1, s1, s0);
    }
  }
  const total = skirtBase + 4 * v;
  return total > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1);
}

export class Terrain {
  constructor(world, scene, detailTex) {
    this.world = world;
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'terrain';
    scene.add(this.group);
    this.chunksPerSide = Math.round((world.n - 1) / CHUNK_CELLS);
    this.indices = LOD_STEPS.map((step) => {
      const q = CHUNK_CELLS / step;
      return buildIndex(q, (q + 1) * (q + 1));
    });
    this.material = this.makeMaterial(detailTex);
    this.chunks = [];
    this.lodDist = [150, 320];
  }

  makeMaterial(detailTex) {
    const mat = new THREE.MeshLambertNodeMaterial({ vertexColors: true });
    const p = positionWorld.xz;
    const macro = texture(detailTex, p.mul(1 / 41)).r;
    const fine = texture(detailTex, p.mul(1 / 5.3)).g;
    const detail = macro.mul(0.22).add(fine.mul(0.16)).add(0.81);
    mat.colorNode = vertexColor().rgb.mul(detail);
    this.wetness = uniform(0);
    return mat;
  }

  // Build geometry for chunk (ci, cj) at LOD level l
  buildGeometry(ci, cj, l) {
    const w = this.world;
    const step = LOD_STEPS[l];
    const q = CHUNK_CELLS / step;
    const v = q + 1;
    const count = v * v + 4 * v;
    const pos = new Float32Array(count * 3);
    const nrm = new Float32Array(count * 3);
    const col = new Uint8Array(count * 4);
    const n = w.n;
    const H = w.heights;
    const C = w.colors;
    const i0 = ci * CHUNK_CELLS;
    const j0 = cj * CHUNK_CELLS;
    const cell = w.cell;
    const half = w.half;
    let k = 0;
    for (let j = 0; j < v; j++) {
      for (let i = 0; i < v; i++) {
        const gi = Math.min(n - 1, i0 + i * step);
        const gj = Math.min(n - 1, j0 + j * step);
        const gk = gj * n + gi;
        pos[k * 3] = gi * cell - half;
        pos[k * 3 + 1] = H[gk];
        pos[k * 3 + 2] = gj * cell - half;
        // normal from central differences at native resolution
        const l1 = H[gj * n + Math.max(0, gi - 1)];
        const r1 = H[gj * n + Math.min(n - 1, gi + 1)];
        const d1 = H[Math.max(0, gj - 1) * n + gi];
        const u1 = H[Math.min(n - 1, gj + 1) * n + gi];
        let nx = l1 - r1,
          ny = 2 * cell,
          nz = d1 - u1;
        const len = Math.hypot(nx, ny, nz);
        nrm[k * 3] = nx / len;
        nrm[k * 3 + 1] = ny / len;
        nrm[k * 3 + 2] = nz / len;
        col[k * 4] = C[gk * 3];
        col[k * 4 + 1] = C[gk * 3 + 1];
        col[k * 4 + 2] = C[gk * 3 + 2];
        col[k * 4 + 3] = 255;
        k++;
      }
    }
    // skirts
    const edgeIdx = [(m) => m, (m) => q * v + m, (m) => m * v, (m) => m * v + q];
    for (let e = 0; e < 4; e++) {
      for (let m = 0; m < v; m++) {
        const src = edgeIdx[e](m);
        pos[k * 3] = pos[src * 3];
        pos[k * 3 + 1] = pos[src * 3 + 1] - SKIRT;
        pos[k * 3 + 2] = pos[src * 3 + 2];
        nrm[k * 3] = nrm[src * 3];
        nrm[k * 3 + 1] = nrm[src * 3 + 1];
        nrm[k * 3 + 2] = nrm[src * 3 + 2];
        col.copyWithin(k * 4, src * 4, src * 4 + 4);
        k++;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 4, true));
    g.setIndex(this.indices[l]);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }

  async build(onProgress = () => {}, castShadow = false) {
    const N = this.chunksPerSide;
    let done = 0;
    for (let cj = 0; cj < N; cj++) {
      for (let ci = 0; ci < N; ci++) {
        const geoms = [null, null, null];
        // LOD2 eagerly (cheap), others lazily
        geoms[2] = this.buildGeometry(ci, cj, 2);
        const bb = geoms[2].boundingBox;
        const mesh = new THREE.Mesh(geoms[2], this.material);
        mesh.receiveShadow = true;
        mesh.castShadow = castShadow;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        const cx = (ci + 0.5) * CHUNK_CELLS * this.world.cell - this.world.half;
        const cz = (cj + 0.5) * CHUNK_CELLS * this.world.cell - this.world.half;
        // skip chunks entirely under deep ocean
        const deep = bb.max.y < -8;
        const chunk = { ci, cj, cx, cz, mesh, geoms, lod: 2, minY: bb.min.y, maxY: bb.max.y, deep };
        if (!deep) this.group.add(mesh);
        this.chunks.push(chunk);
        done++;
      }
      onProgress(done / (N * N));
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  setCastShadow(v) {
    for (const c of this.chunks) c.mesh.castShadow = v;
  }

  update(camPos, viewDist) {
    const d0 = this.lodDist[0];
    const d1 = this.lodDist[1];
    let built = 0;
    for (const c of this.chunks) {
      if (c.deep) continue;
      const dx = Math.max(Math.abs(camPos.x - c.cx) - 50, 0);
      const dz = Math.max(Math.abs(camPos.z - c.cz) - 50, 0);
      const d = Math.hypot(dx, dz);
      c.mesh.visible = d < viewDist + 60;
      if (!c.mesh.visible) continue;
      const lod = d < d0 ? 0 : d < d1 ? 1 : 2;
      // free far high-detail geometry to keep memory bounded on phones
      if (lod === 2 && d > d1 + 300 && c.geoms[0] && c.lod !== 0) {
        c.geoms[0].dispose();
        c.geoms[0] = null;
      }
      if (lod !== c.lod) {
        if (!c.geoms[lod]) {
          if (built >= 2) continue; // spread geometry builds across frames
          c.geoms[lod] = this.buildGeometry(c.ci, c.cj, lod);
          built++;
        }
        c.mesh.geometry = c.geoms[lod];
        c.lod = lod;
      }
    }
  }

  // pre-build LOD0/1 around a point (spawn) to avoid hitches
  prewarm(x, z) {
    for (const c of this.chunks) {
      if (c.deep) continue;
      const d = Math.hypot(x - c.cx, z - c.cz);
      if (d < this.lodDist[0] + 80 && !c.geoms[0]) c.geoms[0] = this.buildGeometry(c.ci, c.cj, 0);
      if (d < this.lodDist[1] + 80 && !c.geoms[1]) c.geoms[1] = this.buildGeometry(c.ci, c.cj, 1);
    }
  }
}
