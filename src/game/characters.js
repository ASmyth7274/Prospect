// Blocky avatars (player, bots, NPCs) rendered with ~9 instanced draw calls total.
// Each body part type is one InstancedMesh; matrices are rebuilt per frame for nearby characters.
import * as THREE from 'three/webgpu';
import { texture, uv, attribute } from 'three/tsl';
import { makeFaceTexture } from '../engine/textures.js';

const MAX = 96;
const LEG = 0.76,
  TORSO_H = 0.76,
  TORSO_W = 0.76,
  TORSO_D = 0.38,
  ARM = 0.76,
  LIMB = 0.37,
  HEAD = 0.5;
const HIP_Y = LEG;
const SHOULDER_Y = HIP_Y + TORSO_H - 0.08;

const _m = new THREE.Matrix4();
const _c = new THREE.Matrix4();
const _u = new THREE.Matrix4();
const _t = new THREE.Matrix4();
const _r = new THREE.Matrix4();
const _s = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _col = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

const HATS = {
  cowboy: { a: [0.56, 0.3, 0.56, 0, 0.17, 0], b: [1.0, 0.06, 1.0, 0, 0.02, 0] },
  cap: { a: [0.54, 0.2, 0.54, 0, 0.1, 0], b: [0.5, 0.05, 0.34, 0, 0.0, 0.36] },
  miner: { a: [0.58, 0.26, 0.58, 0, 0.12, 0], b: [0.18, 0.18, 0.08, 0, 0.12, 0.3], glowB: true },
  beanie: { a: [0.56, 0.24, 0.56, 0, 0.1, 0], b: [0.2, 0.12, 0.2, 0, 0.27, 0] },
  tophat: { a: [0.42, 0.55, 0.42, 0, 0.3, 0], b: [0.72, 0.05, 0.72, 0, 0.02, 0] },
  hood: { a: [0.6, 0.6, 0.62, 0, -0.18, -0.03], b: [0.62, 0.12, 0.64, 0, 0.12, -0.03] },
};

function limbGeo() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  g.translate(0, -0.5, 0);
  return g;
}

function headGeo() {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const uvA = g.attributes.uv;
  // face order: +x,-x,+y,-y,+z,-z; front (+z) = verts 16..19
  for (let i = 0; i < uvA.count; i++) {
    if (i >= 16 && i < 20) continue;
    uvA.setXY(i, 0.25, 0.96);
  }
  return g;
}

export class CharacterRenderer {
  constructor(scene) {
    this.scene = scene;
    this.chars = [];
    const lit = () => new THREE.MeshLambertNodeMaterial();
    this.faceTex = makeFaceTexture();
    const hg = headGeo();
    this.faceOff = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2);
    this.faceOff.setUsage(THREE.DynamicDrawUsage);
    hg.setAttribute('faceOff', this.faceOff);
    const headMat = new THREE.MeshLambertNodeMaterial();
    headMat.colorNode = texture(this.faceTex, uv().mul(0.5).add(attribute('faceOff', 'vec2'))).rgb;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 8);
    const pan = new THREE.CylinderGeometry(1, 0.72, 1, 16, 1, true);
    const panBottom = new THREE.CylinderGeometry(0.72, 0.72, 0.15, 16);
    panBottom.translate(0, -0.45, 0);
    const panGeo = mergeGeos([pan, panBottom]);
    const dirt = new THREE.CylinderGeometry(1, 0.8, 1, 12);
    const glowMat = new THREE.MeshBasicNodeMaterial();
    this.parts = {
      head: new THREE.InstancedMesh(hg, headMat, MAX),
      torso: new THREE.InstancedMesh(box, lit(), MAX),
      limb: new THREE.InstancedMesh(limbGeo(), lit(), MAX * 4),
      hatA: new THREE.InstancedMesh(box, lit(), MAX),
      hatB: new THREE.InstancedMesh(box, lit(), MAX),
      handle: new THREE.InstancedMesh(cyl, lit(), MAX),
      blade: new THREE.InstancedMesh(box, lit(), MAX),
      pan: new THREE.InstancedMesh(panGeo, new THREE.MeshLambertNodeMaterial({ side: THREE.DoubleSide }), MAX),
      dirt: new THREE.InstancedMesh(dirt, lit(), MAX),
      glow: new THREE.InstancedMesh(box, glowMat, MAX),
    };
    for (const [k, m] of Object.entries(this.parts)) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = k !== 'glow' && k !== 'dirt';
      m.receiveShadow = false;
      m.name = 'char-' + k;
      // force instanceColor allocation
      m.setColorAt(0, _col.set(1, 1, 1));
      m.instanceColor.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
    }
    this.visibleList = [];
  }

  add(c) {
    c.anim ||= { state: 'idle', t: 0, phase: 0, speed: 0, lean: 0, actionT: 0 };
    c.y ??= 0;
    c.yaw ??= 0;
    c.scale ??= 1;
    c.visible ??= true;
    c._cols = {
      shirt: new THREE.Color(c.look.shirt),
      pants: new THREE.Color(c.look.pants),
      skin: new THREE.Color(c.look.skin),
      hat: new THREE.Color(c.look.hatColor || '#444444'),
    };
    this.chars.push(c);
    return c;
  }

  remove(c) {
    const i = this.chars.indexOf(c);
    if (i >= 0) this.chars.splice(i, 1);
  }

  refreshLook(c) {
    c._cols.shirt.set(c.look.shirt);
    c._cols.pants.set(c.look.pants);
    c._cols.skin.set(c.look.skin);
    c._cols.hat.set(c.look.hatColor || '#444444');
  }

  // Compose helper: out = base * T(x,y,z) * R(rx,ry,rz order YXZ) * S(sx,sy,sz)
  compose(out, base, x, y, z, rx, ry, rz, sx, sy, sz) {
    _q.setFromEuler(_euler.set(rx, ry, rz, 'YXZ'));
    _t.compose(_v.set(x, y, z), _q, _v2.set(sx, sy, sz));
    return out.multiplyMatrices(base, _t);
  }

  update(dt, camPos, maxDist = 140) {
    const P = this.parts;
    let n = 0,
      li = 0,
      hats = 0,
      tools = 0,
      pans = 0,
      dirts = 0,
      glows = 0;
    this.visibleList.length = 0;
    const md2 = maxDist * maxDist;
    for (const c of this.chars) {
      if (!c.visible) continue;
      const dx = c.x - camPos.x,
        dz = c.z - camPos.z;
      if (dx * dx + dz * dz > md2) continue;
      if (n >= MAX) break;
      this.visibleList.push(c);
      const a = c.anim;
      a.t += dt;
      const st = a.state;
      // ---- pose parameters ----
      let legL = 0,
        legR = 0,
        armL = 0,
        armR = 0,
        armLz = 0,
        armRz = 0,
        lean = 0,
        bob = 0,
        headPitch = 0,
        lift = 0;
      const sw = Math.sin(a.phase);
      if (st === 'walk' || st === 'run') {
        const amp = st === 'run' ? 0.95 : 0.7;
        legL = sw * amp;
        legR = -sw * amp;
        armL = -sw * amp * 0.9;
        armR = sw * amp * 0.9;
        bob = Math.abs(Math.cos(a.phase)) * 0.06;
        lean = st === 'run' ? 0.12 : 0.04;
      } else if (st === 'jump' || st === 'fall') {
        armL = armR = -2.7;
        armLz = 0.25;
        armRz = -0.25;
        legL = -0.35;
        legR = 0.2;
      } else if (st === 'swim') {
        lean = 1.15;
        armL = -2.4 + Math.sin(a.t * 5) * 1.2;
        armR = -2.4 - Math.sin(a.t * 5) * 1.2;
        legL = Math.sin(a.t * 8) * 0.4;
        legR = -legL;
        lift = -0.9;
      } else if (st === 'sit') {
        legL = legR = -1.5;
        lift = -0.55;
        armL = armR = -0.5;
        headPitch = 0.15 + Math.sin(a.t * 0.7) * 0.05;
      } else if (st === 'wave' || st === 'celebrate') {
        armR = -2.9;
        armRz = Math.sin(a.t * 10) * 0.35;
        if (st === 'celebrate') {
          armL = -2.9;
          armLz = -Math.sin(a.t * 10) * 0.35;
          bob = Math.abs(Math.sin(a.t * 8)) * 0.25;
        }
      } else {
        // idle breathing
        armL = Math.sin(a.t * 1.6) * 0.04;
        armR = -Math.sin(a.t * 1.6) * 0.04;
        bob = Math.sin(a.t * 1.6) * 0.01;
      }

      // tool poses override arms
      let toolMode = null;
      let digK = 0;
      if (st === 'dig') {
        // a.actionT 0..1 over a stroke
        const t = a.actionT;
        const raise = t < 0.4 ? t / 0.4 : t < 0.62 ? 1 - (t - 0.4) / 0.22 : 0;
        const plunge = t >= 0.4 && t < 0.62 ? (t - 0.4) / 0.22 : t >= 0.62 ? 1 - (t - 0.62) / 0.38 : 0;
        armR = -0.75 - raise * 1.25 + plunge * 0.15;
        armL = -0.95 - raise * 1.0;
        armRz = 0.25;
        armLz = -0.15;
        lean = 0.1 + plunge * 0.32 - raise * 0.08;
        legL = -0.2 * plunge;
        legR = 0.15 * plunge;
        digK = plunge - raise;
        toolMode = 'dig';
      } else if (st === 'shake') {
        const s = Math.sin(a.t * 22) * (a.shaking ? 1 : 0.15);
        armL = armR = -1.05;
        armLz = -0.42 + s * 0.05;
        armRz = 0.42 + s * 0.05;
        lean = 0.12;
        toolMode = 'pan';
      } else if (c.tool === 'pan' && st !== 'swim') {
        armR = -0.95 + (st === 'walk' ? sw * 0.08 : 0);
        armRz = 0.2;
        toolMode = 'panCarry';
      } else if (c.tool === 'shovel' && st !== 'swim' && st !== 'sit') {
        armR = -0.55 + (st === 'walk' || st === 'run' ? sw * 0.15 : 0);
        toolMode = 'shovelCarry';
      }

      // ---- base matrices ----
      const sc = c.scale;
      _q.setFromAxisAngle(UP, c.yaw);
      _c.compose(_v.set(c.x, c.y + bob + lift * sc, c.z), _q, _v2.set(sc, sc, sc));
      // upper body pivots at hips with lean
      _u.copy(_c).multiply(_t.makeTranslation(0, HIP_Y, 0)).multiply(_r.makeRotationX(lean)).multiply(_s.makeTranslation(0, -HIP_Y, 0));

      // torso
      this.compose(_m, _u, 0, HIP_Y + TORSO_H / 2, 0, 0, 0, 0, TORSO_W, TORSO_H, TORSO_D);
      P.torso.setMatrixAt(n, _m);
      P.torso.setColorAt(n, c._cols.shirt);
      // head
      this.compose(_m, _u, 0, HIP_Y + TORSO_H + HEAD / 2, 0, headPitch, 0, 0, HEAD, HEAD, HEAD);
      P.head.setMatrixAt(n, _m);
      P.head.setColorAt(n, c._cols.skin);
      const f = c.look.face || 0;
      this.faceOff.setXY(n, (f % 2) * 0.5, 0.5 - Math.floor(f / 2) * 0.5);
      // hat
      const hat = HATS[c.look.hat];
      if (hat) {
        const top = HIP_Y + TORSO_H + HEAD;
        const A = hat.a,
          B = hat.b;
        this.compose(_m, _u, A[3], top + A[4], A[5], headPitch, 0, 0, A[0], A[1], A[2]);
        P.hatA.setMatrixAt(hats, _m);
        P.hatA.setColorAt(hats, c._cols.hat);
        this.compose(_m, _u, B[3], top + B[4], B[5], headPitch, 0, 0, B[0], B[1], B[2]);
        if (hat.glowB) {
          P.glow.setMatrixAt(glows, _m);
          P.glow.setColorAt(glows, _col.set(1, 0.95, 0.6));
          glows++;
          P.hatB.setMatrixAt(hats, _m.makeScale(0, 0, 0));
        } else {
          P.hatB.setMatrixAt(hats, _m);
        }
        P.hatB.setColorAt(hats, c._cols.hat);
        hats++;
      }
      // arms (upper body), legs (base)
      const armCol = c.look.sleeves === false ? c._cols.skin : c._cols.shirt;
      this.compose(_m, _u, TORSO_W / 2 + LIMB / 2, SHOULDER_Y, 0, armL, 0, armLz, LIMB, ARM, LIMB);
      P.limb.setMatrixAt(li, _m);
      P.limb.setColorAt(li++, armCol);
      this.compose(_m, _u, -(TORSO_W / 2 + LIMB / 2), SHOULDER_Y, 0, armR, 0, armRz, LIMB, ARM, LIMB);
      P.limb.setMatrixAt(li, _m);
      P.limb.setColorAt(li++, armCol);
      this.compose(_m, _c, TORSO_W / 4, HIP_Y, 0, legL, 0, 0, LIMB, LEG, LIMB);
      P.limb.setMatrixAt(li, _m);
      P.limb.setColorAt(li++, c._cols.pants);
      this.compose(_m, _c, -TORSO_W / 4, HIP_Y, 0, legR, 0, 0, LIMB, LEG, LIMB);
      P.limb.setMatrixAt(li, _m);
      P.limb.setColorAt(li++, c._cols.pants);

      // ---- tools ----
      // right hand position in upper-body space
      const handR = handPos(-(TORSO_W / 2 + LIMB / 2), armR, armRz, _v3);
      if (toolMode === 'dig' || toolMode === 'shovelCarry') {
        // shovel line from grip to tip (upper-body space)
        let tipx, tipy, tipz;
        if (toolMode === 'dig') {
          tipx = -0.1;
          tipy = 0.15 + Math.max(0, -digK) * 1.6 - Math.max(0, digK) * 0.35;
          tipz = 0.95 + Math.max(0, -digK) * 0.2;
        } else {
          tipx = handR.x - 0.05;
          tipy = handR.y - 1.05;
          tipz = handR.z + 0.45;
        }
        const gx = handR.x,
          gy = handR.y + 0.15,
          gz = handR.z;
        const dx2 = tipx - gx,
          dy2 = tipy - gy,
          dz2 = tipz - gz;
        const len = Math.hypot(dx2, dy2, dz2) || 1;
        _v.set(dx2 / len, dy2 / len, dz2 / len);
        _q.setFromUnitVectors(UP, _v.clone().negate());
        const L = 1.25;
        _t.compose(_v2.set(gx + (_v.x * L) / 2 - _v.x * 0.25, gy + (_v.y * L) / 2 - _v.y * 0.25, gz + (_v.z * L) / 2 - _v.z * 0.25), _q, _v3.set(0.045, L, 0.045));
        _m.multiplyMatrices(_u, _t);
        P.handle.setMatrixAt(tools, _m);
        P.handle.setColorAt(tools, _col.set('#7a5230'));
        const bx = gx + _v.x * (L - 0.25 + 0.17),
          by = gy + _v.y * (L - 0.25 + 0.17),
          bz = gz + _v.z * (L - 0.25 + 0.17);
        _t.compose(_v2.set(bx, by, bz), _q, _v3.set(0.3, 0.36, 0.05));
        _m.multiplyMatrices(_u, _t);
        P.blade.setMatrixAt(tools, _m);
        P.blade.setColorAt(tools, _col.set(c.shovelColor || '#9aa4ae'));
        tools++;
      } else if (toolMode === 'pan' || toolMode === 'panCarry') {
        let px, py, pz, tilt, rz;
        if (toolMode === 'pan') {
          const s = Math.sin(a.t * 22) * (a.shaking ? 1 : 0.15);
          px = s * 0.09;
          py = 1.12;
          pz = 0.62;
          tilt = 0.25;
          rz = s * 0.12;
        } else {
          px = handR.x + 0.1;
          py = handR.y - 0.02;
          pz = handR.z + 0.18;
          tilt = 0.15;
          rz = 0;
        }
        this.compose(_m, _u, px, py, pz, tilt, 0, rz, 0.34, 0.12, 0.34);
        P.pan.setMatrixAt(pans, _m);
        P.pan.setColorAt(pans, _col.set(c.panColor || '#8a5a3a'));
        pans++;
        const fill = c.panFill || 0;
        if (fill > 0.01) {
          this.compose(_m, _u, px, py - 0.02 + fill * 0.05, pz, tilt, a.t * (a.shaking ? 3 : 0), rz, 0.27 + fill * 0.04, 0.03 + fill * 0.07, 0.27 + fill * 0.04);
          P.dirt.setMatrixAt(dirts, _m);
          P.dirt.setColorAt(dirts, _col.set(c.dirtColor || '#8a6a44'));
          dirts++;
        }
      }
      // name tag anchor (world space)
      c.headWorld ||= new THREE.Vector3();
      c.headWorld.set(0, HIP_Y + TORSO_H + HEAD + 0.55, 0).applyMatrix4(_c);
      n++;
    }
    P.head.count = P.torso.count = n;
    P.limb.count = li;
    P.hatA.count = P.hatB.count = hats;
    P.handle.count = P.blade.count = tools;
    P.pan.count = pans;
    P.dirt.count = dirts;
    P.glow.count = glows;
    for (const m of Object.values(P)) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    this.faceOff.needsUpdate = true;
  }
}

const _euler = new THREE.Euler();

function handPos(sx, rx, rz, out) {
  // shoulder at (sx, SHOULDER_Y, 0); limb hangs -Y length ARM, rotated by Euler(rx,0,rz,'YXZ')
  _euler.set(rx, 0, rz, 'YXZ');
  out.set(0, -ARM, 0).applyEuler(_euler);
  out.x += sx;
  out.y += SHOULDER_Y;
  return out;
}

function mergeGeos(list) {
  const pos = [],
    nrm = [],
    uvs = [];
  for (let g of list) {
    if (g.index) g = g.toNonIndexed();
    pos.push(...g.attributes.position.array);
    nrm.push(...g.attributes.normal.array);
    uvs.push(...g.attributes.uv.array);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return out;
}

export const AVATAR = { LEG, TORSO_H, HEAD, height: LEG + TORSO_H + HEAD };
