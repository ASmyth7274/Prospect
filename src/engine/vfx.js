// CPU-simulated particle pools rendered as 3 instanced meshes (solid, additive glow, alpha smoke),
// plus pooled light pillars ("loot beams") for rare finds.
import * as THREE from 'three/webgpu';
import { attribute, vec3, float, time, sin, mix, uniform, positionLocal, uv, smoothstep, abs } from 'three/tsl';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

class Pool {
  constructor(scene, geo, mat, max, name) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.name = name;
    this.mesh.setColorAt(0, _c.set(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.p = [];
    this.alpha = null;
  }

  spawn(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({
      x: o.x,
      y: o.y,
      z: o.z,
      vx: o.vx || 0,
      vy: o.vy || 0,
      vz: o.vz || 0,
      g: o.g ?? 9.8,
      drag: o.drag ?? 0.5,
      life: o.life || 1,
      age: 0,
      s0: o.size || 0.15,
      s1: o.sizeEnd ?? (o.size || 0.15) * 0.2,
      r: o.color?.r ?? 1,
      gg: o.color?.g ?? 1,
      b: o.color?.b ?? 1,
      rot: Math.random() * 6,
      spin: o.spin ?? (Math.random() - 0.5) * 8,
      a0: o.alpha ?? 1,
      ground: o.ground ?? -1e9,
      stretch: o.stretch || 0,
    });
  }

  update(dt) {
    const arr = this.p;
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      const q = arr[i];
      q.age += dt;
      if (q.age >= q.life) continue;
      q.vy -= q.g * dt;
      const d = Math.max(0, 1 - q.drag * dt);
      q.vx *= d;
      q.vy *= d;
      q.vz *= d;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      if (q.y < q.ground) {
        q.y = q.ground;
        q.vy *= -0.25;
        q.vx *= 0.5;
        q.vz *= 0.5;
      }
      q.rot += q.spin * dt;
      const t = q.age / q.life;
      const s = q.s0 + (q.s1 - q.s0) * t;
      _e.set(q.rot, q.rot * 0.7, 0);
      _q.setFromEuler(_e);
      if (q.stretch) _s.set(s * 0.4, s * (1 + q.stretch), s * 0.4);
      else _s.set(s, s, s);
      _m.compose(_p.set(q.x, q.y, q.z), _q, _s);
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, _c.setRGB(q.r, q.gg, q.b));
      if (this.alpha) this.alpha.array[n] = q.a0 * (1 - t) * Math.min(1, t * 6);
      arr[n++] = q;
    }
    arr.length = n;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    if (this.alpha) this.alpha.needsUpdate = true;
  }
}

export class VFX {
  constructor(scene, quality) {
    this.scene = scene;
    this.q = quality.particles || 1;
    const box = new THREE.BoxGeometry(1, 1, 1);
    const solidMat = new THREE.MeshLambertNodeMaterial();
    this.solid = new Pool(scene, box, solidMat, Math.round(900 * this.q), 'fx-solid');
    const oct = new THREE.OctahedronGeometry(1, 0);
    const addMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    addMat.fog = false;
    this.glow = new Pool(scene, oct, addMat, Math.round(900 * this.q), 'fx-glow');
    const smokeGeo = new THREE.IcosahedronGeometry(1, 0);
    const alphaAttr = new THREE.InstancedBufferAttribute(new Float32Array(Math.round(700 * this.q)), 1);
    alphaAttr.setUsage(THREE.DynamicDrawUsage);
    smokeGeo.setAttribute('ialpha', alphaAttr);
    const smokeMat = new THREE.MeshLambertNodeMaterial({ transparent: true, depthWrite: false });
    smokeMat.opacityNode = attribute('ialpha', 'float');
    this.smoke = new Pool(scene, smokeGeo, smokeMat, Math.round(700 * this.q), 'fx-smoke');
    this.smoke.alpha = alphaAttr;
    // loot beams
    this.beams = [];
    const beamGeo = new THREE.CylinderGeometry(0.6, 0.9, 60, 12, 1, true);
    beamGeo.translate(0, 30, 0);
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      mat.fog = false;
      const op = uniform(0);
      const col = uniform(new THREE.Color(1, 1, 1));
      const fade = smoothstep(0.0, 0.15, uv().y).mul(float(1).sub(uv().y));
      mat.colorNode = col.mul(fade).mul(op).mul(sin(time.mul(6).add(uv().y.mul(20))).mul(0.15).add(1));
      const mesh = new THREE.Mesh(beamGeo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.beams.push({ mesh, op, col, t: 0, life: 0 });
    }
    // ground rings (totem auras, events)
    this.rings = [];
    this.emitters = [];
  }

  burst(kind, x, y, z, opts = {}) {
    const n = Math.max(1, Math.round((opts.n || 12) * this.q));
    const col = new THREE.Color(opts.color || '#8a6a44');
    switch (kind) {
      case 'dirt':
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 1.5 + Math.random() * 3;
          const c = col.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.12);
          this.solid.spawn({ x: x + (Math.random() - 0.5) * 0.4, y: y + 0.1, z: z + (Math.random() - 0.5) * 0.4, vx: Math.cos(a) * sp * 0.5 + (opts.dx || 0), vy: 3 + Math.random() * 4, vz: Math.sin(a) * sp * 0.5 + (opts.dz || 0), g: 18, life: 0.7 + Math.random() * 0.5, size: 0.09 + Math.random() * 0.12, color: c, ground: y - 0.05 });
        }
        for (let i = 0; i < n / 3; i++) this.smoke.spawn({ x: x + (Math.random() - 0.5), y: y + 0.3, z: z + (Math.random() - 0.5), vx: (Math.random() - 0.5) * 1.5, vy: 0.8, vz: (Math.random() - 0.5) * 1.5, g: 0, drag: 1.5, life: 0.9, size: 0.3, sizeEnd: 0.9, color: col.clone().lerp(new THREE.Color(1, 1, 1), 0.3), alpha: 0.45 });
        break;
      case 'splash':
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 1 + Math.random() * 2.5;
          this.glow.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: 2.5 + Math.random() * 3.5, vz: Math.sin(a) * sp, g: 14, life: 0.5 + Math.random() * 0.4, size: 0.05 + Math.random() * 0.06, color: new THREE.Color(0.55, 0.75, 0.85), ground: y - 0.2 });
        }
        for (let i = 0; i < n / 4; i++) this.smoke.spawn({ x: x + (Math.random() - 0.5) * 0.6, y: y + 0.05, z: z + (Math.random() - 0.5) * 0.6, g: 0, drag: 2, life: 0.6, size: 0.25, sizeEnd: 0.7, color: new THREE.Color(0.85, 0.95, 1), alpha: 0.5 });
        break;
      case 'sparkle':
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 0.5 + Math.random() * 2.5;
          this.glow.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 4, vz: Math.sin(a) * sp, g: 2, drag: 1.2, life: 0.8 + Math.random() * 1.0, size: 0.08 + Math.random() * 0.1, sizeEnd: 0, color: col.clone().offsetHSL((Math.random() - 0.5) * 0.08, 0, 0.1) });
        }
        break;
      case 'confetti':
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 2 + Math.random() * 5;
          const c = new THREE.Color().setHSL(Math.random(), 0.9, 0.6);
          this.solid.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: 6 + Math.random() * 7, vz: Math.sin(a) * sp, g: 9, drag: 1.4, life: 2 + Math.random(), size: 0.12, sizeEnd: 0.1, color: c, spin: 12, ground: (opts.ground ?? y) - 0.1 });
        }
        break;
      case 'smoke':
        this.smoke.spawn({ x: x + (Math.random() - 0.5) * 0.4, y, z: z + (Math.random() - 0.5) * 0.4, vx: (opts.wind || 0.4) + (Math.random() - 0.5) * 0.3, vy: 1.2 + Math.random() * 0.6, vz: (Math.random() - 0.5) * 0.3, g: -0.2, drag: 0.4, life: 3 + Math.random() * 2, size: 0.4, sizeEnd: 1.8, color: opts.color ? col : new THREE.Color(0.55, 0.55, 0.58), alpha: opts.alpha ?? 0.35 });
        break;
      case 'ember':
        this.glow.spawn({ x: x + (Math.random() - 0.5) * 0.6, y, z: z + (Math.random() - 0.5) * 0.6, vx: (Math.random() - 0.5) * 0.8, vy: 1.5 + Math.random() * 2, vz: (Math.random() - 0.5) * 0.8, g: -0.3, drag: 0.6, life: 1.2 + Math.random(), size: 0.05, sizeEnd: 0, color: new THREE.Color(1, 0.5 + Math.random() * 0.3, 0.1) });
        break;
      case 'shards':
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          this.glow.spawn({ x, y: y + 0.5, z, vx: Math.cos(a) * 2, vy: 4 + Math.random() * 3, vz: Math.sin(a) * 2, g: 8, drag: 0.8, life: 1.4, size: 0.14, sizeEnd: 0.02, color: new THREE.Color(1, 0.4, 0.85) });
        }
        break;
      case 'meteor': {
        // falling streak handled by caller via trail(); here: impact
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 4 + Math.random() * 8;
          this.glow.spawn({ x, y, z, vx: Math.cos(a) * sp, vy: 4 + Math.random() * 8, vz: Math.sin(a) * sp, g: 12, drag: 0.5, life: 1 + Math.random(), size: 0.18, sizeEnd: 0, color: new THREE.Color(1, 0.6 + Math.random() * 0.3, 0.2), ground: y });
          this.solid.spawn({ x, y, z, vx: Math.cos(a) * sp * 0.6, vy: 5 + Math.random() * 6, vz: Math.sin(a) * sp * 0.6, g: 18, life: 1.5, size: 0.25, color: new THREE.Color(0.25, 0.22, 0.24), ground: y });
        }
        for (let i = 0; i < n / 2; i++) this.smoke.spawn({ x: x + (Math.random() - 0.5) * 3, y: y + 0.5, z: z + (Math.random() - 0.5) * 3, vy: 1.5, g: -0.2, drag: 0.5, life: 4, size: 1, sizeEnd: 4, color: new THREE.Color(0.3, 0.28, 0.3), alpha: 0.5 });
        break;
      }
      case 'trail':
        this.glow.spawn({ x, y, z, g: 0, life: opts.life || 0.6, size: opts.size || 0.6, sizeEnd: 0, color: col });
        break;
      case 'levelup':
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          this.glow.spawn({ x: x + Math.cos(a) * 1.2, y, z: z + Math.sin(a) * 1.2, vx: 0, vy: 3 + Math.random() * 2, vz: 0, g: 0, drag: 0.3, life: 1.6, size: 0.15, sizeEnd: 0, color: new THREE.Color(1, 0.85, 0.3) });
        }
        break;
    }
  }

  beam(x, y, z, color, life = 4, scale = 1) {
    let b = this.beams.find((q) => !q.mesh.visible) || this.beams[0];
    b.mesh.position.set(x, y, z);
    b.mesh.scale.set(scale, scale, scale);
    b.col.value.set(color);
    b.t = 0;
    b.life = life;
    b.mesh.visible = true;
  }

  addEmitter(e) {
    this.emitters.push({ acc: 0, ...e });
    return e;
  }

  update(dt, camPos) {
    // emitters near camera only
    for (const e of this.emitters) {
      if (e.enabled === false) continue;
      const d = Math.hypot(e.x - camPos.x, e.z - camPos.z);
      if (d > (e.range || 120)) continue;
      e.acc += dt * e.rate * this.q;
      while (e.acc > 1) {
        e.acc -= 1;
        this.burst(e.kind, e.x, e.y, e.z, e.opts || {});
      }
    }
    this.solid.update(dt);
    this.glow.update(dt);
    this.smoke.update(dt);
    for (const b of this.beams) {
      if (!b.mesh.visible) continue;
      b.t += dt;
      const k = b.t / b.life;
      b.op.value = Math.min(1, b.t * 4) * (1 - Math.max(0, (k - 0.6) / 0.4)) * 0.9;
      b.mesh.rotation.y += dt;
      if (k >= 1) b.mesh.visible = false;
    }
  }
}
