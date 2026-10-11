// Accumulates many coloured primitives into one BufferGeometry (one draw call).
import * as THREE from 'three/webgpu';

const _m = new THREE.Matrix4();
const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

const cache = new Map();
function protoGeo(key, make) {
  let g = cache.get(key);
  if (!g) {
    g = make();
    if (g.index) g = g.toNonIndexed();
    g.deleteAttribute('uv');
    g.computeVertexNormals();
    cache.set(key, g);
  }
  return g;
}

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.col = [];
  }

  get vertexCount() {
    return this.pos.length / 3;
  }

  // transform: {x,y,z, rx,ry,rz, sx,sy,sz} or a Matrix4
  add(geo, color, t) {
    if (t && t.isMatrix4) _m.copy(t);
    else {
      _p.set(t.x || 0, t.y || 0, t.z || 0);
      _e.set(t.rx || 0, t.ry || 0, t.rz || 0, 'YXZ');
      _q.setFromEuler(_e);
      _s.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
      _m.compose(_p, _q, _s);
    }
    if (this.base) _m.premultiply(this.base);
    _n.getNormalMatrix(_m);
    const P = geo.attributes.position.array;
    const N = geo.attributes.normal.array;
    const c = color.isColor ? color : new THREE.Color(color);
    const vc = geo.attributes.color ? geo.attributes.color.array : null;
    for (let i = 0; i < P.length; i += 3) {
      _v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(_m);
      this.pos.push(_v.x, _v.y, _v.z);
      _v.set(N[i], N[i + 1], N[i + 2]).applyMatrix3(_n).normalize();
      this.nrm.push(_v.x, _v.y, _v.z);
      if (vc) this.col.push(vc[i] * c.r, vc[i + 1] * c.g, vc[i + 2] * c.b);
      else this.col.push(c.r, c.g, c.b);
    }
    return this;
  }

  box(w, h, d, color, t = {}) {
    const g = protoGeo('box', () => new THREE.BoxGeometry(1, 1, 1));
    return this.add(g, color, { ...t, sx: w * (t.sx ?? 1), sy: h * (t.sy ?? 1), sz: d * (t.sz ?? 1) });
  }

  cyl(rTop, rBot, h, segs, color, t = {}) {
    const g = protoGeo(`cyl${rTop / rBot}_${segs}`, () => new THREE.CylinderGeometry(rTop / rBot, 1, 1, segs, 1));
    return this.add(g, color, { ...t, sx: rBot * (t.sx ?? 1), sy: h * (t.sy ?? 1), sz: rBot * (t.sz ?? 1) });
  }

  cone(r, h, segs, color, t = {}) {
    const g = protoGeo(`cone${segs}`, () => new THREE.ConeGeometry(1, 1, segs, 1));
    return this.add(g, color, { ...t, sx: r, sy: h, sz: r });
  }

  sphere(r, color, t = {}, detail = 1) {
    const g = protoGeo(`ico${detail}`, () => new THREE.IcosahedronGeometry(1, detail));
    return this.add(g, color, { ...t, sx: r * (t.sx ?? 1), sy: r * (t.sy ?? 1), sz: r * (t.sz ?? 1) });
  }

  dodeca(r, color, t = {}) {
    const g = protoGeo('dodeca', () => new THREE.DodecahedronGeometry(1, 0));
    return this.add(g, color, { ...t, sx: r * (t.sx ?? 1), sy: r * (t.sy ?? 1), sz: r * (t.sz ?? 1) });
  }

  // gable roof: triangular prism, ridge along X
  roof(w, h, d, color, t = {}) {
    const g = protoGeo('roof', () => {
      const shape = new THREE.Shape();
      shape.moveTo(-0.5, 0);
      shape.lineTo(0.5, 0);
      shape.lineTo(0, 1);
      shape.lineTo(-0.5, 0);
      const eg = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
      eg.translate(0, 0, -0.5);
      eg.rotateY(Math.PI / 2);
      return eg;
    });
    return this.add(g, color, { ...t, sx: w, sy: h, sz: d });
  }

  torus(r, tube, color, t = {}, segs = 16) {
    const g = protoGeo(`torus${tube / r}_${segs}`, () => new THREE.TorusGeometry(1, tube / r, 6, segs));
    return this.add(g, color, { ...t, sx: r, sy: r, sz: r });
  }

  toGeometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

export function protoGeometry(key, make) {
  return protoGeo(key, make);
}
