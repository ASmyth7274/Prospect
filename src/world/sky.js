// Day/night cycle, sky dome (TSL), clouds, lights and fog with per-zone atmosphere overrides.
import * as THREE from 'three/webgpu';
import {
  positionLocal,
  normalize,
  vec3,
  float,
  mix,
  smoothstep,
  max,
  pow,
  dot,
  uniform,
  hash,
  floor,
  time,
  sin,
  clamp,
  abs,
} from 'three/tsl';

const C = (hex) => new THREE.Color(hex);
// Keyframes over the day (t: 0=midnight, .25 sunrise, .5 noon, .75 sunset)
const KEYS = [
  { t: 0.0, zenith: C('#071030'), horizon: C('#1f3058'), sun: C('#a9bcf5'), sunI: 0.95, hemiSky: C('#7f90cc'), hemiGround: C('#34344a'), hemiI: 1.45, amb: 0.62 },
  { t: 0.2, zenith: C('#0d1838'), horizon: C('#2a3a66'), sun: C('#a9bcf5'), sunI: 0.85, hemiSky: C('#7f90cc'), hemiGround: C('#34344a'), hemiI: 1.45, amb: 0.62 },
  { t: 0.255, zenith: C('#3c64b0'), horizon: C('#ffa56b'), sun: C('#ffae66'), sunI: 1.4, hemiSky: C('#a7b8e0'), hemiGround: C('#4a3a30'), hemiI: 1.1, amb: 0.75 },
  { t: 0.32, zenith: C('#3f86f0'), horizon: C('#cfe6ff'), sun: C('#fff1d6'), sunI: 2.5, hemiSky: C('#cfe3ff'), hemiGround: C('#5e5340'), hemiI: 1.35, amb: 1.0 },
  { t: 0.5, zenith: C('#2f7df5'), horizon: C('#c4e2ff'), sun: C('#fff8ea'), sunI: 2.8, hemiSky: C('#d4e8ff'), hemiGround: C('#625846'), hemiI: 1.4, amb: 1.05 },
  { t: 0.68, zenith: C('#3a7fe8'), horizon: C('#d6e6ff'), sun: C('#fff0d0'), sunI: 2.5, hemiSky: C('#cfe0ff'), hemiGround: C('#5e5340'), hemiI: 1.3, amb: 1.0 },
  { t: 0.745, zenith: C('#3a4f9a'), horizon: C('#ff8a55'), sun: C('#ff9a55'), sunI: 1.4, hemiSky: C('#b39ac8'), hemiGround: C('#4a3530'), hemiI: 1.05, amb: 0.75 },
  { t: 0.8, zenith: C('#101c44'), horizon: C('#3a3466'), sun: C('#a9bcf5'), sunI: 0.85, hemiSky: C('#7f90cc'), hemiGround: C('#34344a'), hemiI: 1.45, amb: 0.62 },
  { t: 1.0, zenith: C('#071030'), horizon: C('#1f3058'), sun: C('#a9bcf5'), sunI: 0.95, hemiSky: C('#7f90cc'), hemiGround: C('#34344a'), hemiI: 1.45, amb: 0.62 },
];

// Zone atmospheres: fog tint + density, light multipliers
export const ATMOS = {
  none: null,
  cave: { fog: C('#1d1430'), fogNear: 10, fogFar: 150, light: 0.32, hemi: C('#b9a3ff'), amb: 0.6, sky: 0 },
  sandstorm: { fog: C('#d49a5a'), fogNear: 4, fogFar: 85, light: 0.75, hemi: C('#ffcf9a'), amb: 0.9, sky: 1 },
  blizzard: { fog: C('#dfe8f2'), fogNear: 3, fogFar: 75, light: 0.7, hemi: C('#e8f0ff'), amb: 0.95, sky: 1 },
  volcano: { fog: C('#7a4a38'), fogNear: 40, fogFar: 360, light: 0.95, hemi: C('#ffb08a'), amb: 0.95, sky: 1 },
  eruption: { fog: C('#5a3024'), fogNear: 12, fogFar: 180, light: 0.8, hemi: C('#ff8a5a'), amb: 0.85, sky: 1 },
  rain: { fog: C('#7d8a99'), fogNear: 20, fogFar: 260, light: 0.6, hemi: C('#9aa8b8'), amb: 0.8, sky: 1 },
  rift: { fog: C('#3a1658'), fogNear: 20, fogFar: 240, light: 0.75, hemi: C('#b46bff'), amb: 0.85, sky: 1 },
};

export class Environment {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.dayLength = 18 * 60; // seconds per full day
    this.t = 0.33; // start morning
    this.atmos = null;
    this.atmosBlend = 0;
    this.atmosTarget = null;

    // shared uniforms used by water & other materials
    this.u = {
      sunDir: uniform(new THREE.Vector3(0.3, 0.8, 0.2).normalize()),
      moonDir: uniform(new THREE.Vector3(-0.3, 0.6, -0.2).normalize()),
      sunColor: uniform(new THREE.Color(1, 1, 1)),
      sunSpec: uniform(1),
      ambient: uniform(1),
      skyReflect: uniform(new THREE.Color(0.7, 0.85, 1)),
      zenith: uniform(new THREE.Color()),
      horizon: uniform(new THREE.Color()),
      ground: uniform(new THREE.Color(0.25, 0.22, 0.2)),
      stars: uniform(0),
      sunVis: uniform(1),
      skyMix: uniform(1),
      fogCol: uniform(new THREE.Color()),
    };

    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x5e5340, 1.3);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.position.set(100, 200, 50);
    scene.add(this.sun);
    scene.add(this.sun.target);
    this.setShadows(quality.shadows);

    this.fog = new THREE.Fog(0xbfe3ff, 60, quality.viewDist * 0.95);
    scene.fog = this.fog;

    this.buildSky();
    this.buildClouds(quality.clouds);
    this._tmpA = new THREE.Color();
    this._tmpB = new THREE.Color();
  }

  setShadows(size) {
    const s = this.sun;
    s.castShadow = size > 0;
    if (size > 0) {
      s.shadow.mapSize.set(size, size);
      const ext = size >= 4096 ? 90 : size >= 2048 ? 70 : 55;
      s.shadow.camera.left = -ext;
      s.shadow.camera.right = ext;
      s.shadow.camera.top = ext;
      s.shadow.camera.bottom = -ext;
      s.shadow.camera.near = 1;
      s.shadow.camera.far = 600;
      s.shadow.bias = -0.0008;
      s.shadow.normalBias = 0.6;
      s.shadow.camera.updateProjectionMatrix();
      this.shadowExt = ext;
      this.shadowTexel = (ext * 2) / size;
    }
  }

  buildSky() {
    const u = this.u;
    const geo = new THREE.SphereGeometry(1, 32, 16);
    const mat = new THREE.MeshBasicNodeMaterial();
    mat.side = THREE.BackSide;
    mat.depthWrite = false;
    mat.fog = false;
    const dir = normalize(positionLocal);
    const y = dir.y;
    const up = pow(clamp(y, 0.0, 1.0), 0.55);
    let col = mix(u.horizon, u.zenith, up);
    col = mix(col, u.ground, smoothstep(0.0, -0.25, y));
    const sd = max(dot(dir, u.sunDir), 0.0);
    const sunDisc = smoothstep(0.9985, 0.9993, sd).mul(u.sunVis);
    const sunGlow = pow(sd, 10).mul(0.35).add(pow(sd, 120).mul(0.6)).mul(u.sunVis);
    col = col.add(u.sunColor.mul(sunDisc.mul(2.0).add(sunGlow)));
    const md = max(dot(dir, u.moonDir), 0.0);
    const moon = smoothstep(0.9990, 0.9994, md);
    col = col.add(vec3(0.85, 0.9, 1.0).mul(moon).mul(u.stars)).add(vec3(0.3, 0.38, 0.6).mul(pow(md, 60)).mul(u.stars).mul(0.4));
    // stars
    const cell = floor(dir.mul(220));
    const seed = cell.x.mul(1.0).add(cell.y.mul(157.0)).add(cell.z.mul(113.0));
    const h = hash(seed);
    const tw = sin(time.mul(2.0).add(h.mul(40.0))).mul(0.35).add(0.65);
    const star = smoothstep(0.9965, 0.9995, h).mul(tw).mul(u.stars).mul(smoothstep(0.02, 0.2, y));
    col = col.add(vec3(star));
    // zone tint (fog colour) blended over the sky
    col = mix(u.fogCol, col, u.skyMix);
    mat.colorNode = col;
    this.skyMesh = new THREE.Mesh(geo, mat);
    this.skyMesh.renderOrder = 1; // after opaque geometry -> early depth reject
    this.skyMesh.frustumCulled = false;
    this.skyMesh.name = 'sky';
    this.scene.add(this.skyMesh);
  }

  buildClouds(count) {
    const geo = new THREE.IcosahedronGeometry(1, 1);
    const mat = new THREE.MeshLambertNodeMaterial({ color: 0xffffff });
    mat.emissiveNode = vec3(0.25, 0.27, 0.32).mul(this.u.ambient);
    const blobs = [];
    const rand = Math.random;
    const clouds = Math.max(4, count);
    for (let c = 0; c < clouds; c++) {
      const cx = (rand() - 0.5) * 2200;
      const cz = (rand() - 0.5) * 2200;
      const cy = 210 + rand() * 90;
      const parts = 4 + Math.floor(rand() * 5);
      for (let p = 0; p < parts; p++) {
        blobs.push({
          x: cx + (rand() - 0.5) * 70,
          y: cy + (rand() - 0.5) * 10,
          z: cz + (rand() - 0.5) * 35,
          sx: 18 + rand() * 26,
          sy: 9 + rand() * 9,
          sz: 14 + rand() * 18,
        });
      }
    }
    this.cloudBlobs = blobs;
    this.clouds = new THREE.InstancedMesh(geo, mat, blobs.length);
    this.clouds.frustumCulled = false;
    this.clouds.name = 'clouds';
    this._m = new THREE.Matrix4();
    this.cloudOffset = 0;
    this.updateClouds(0);
    this.scene.add(this.clouds);
  }

  updateClouds(dt) {
    this.cloudOffset += dt * 3.2;
    const m = this._m;
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let i = 0; i < this.cloudBlobs.length; i++) {
      const b = this.cloudBlobs[i];
      let x = b.x + this.cloudOffset;
      x = ((((x + 1100) % 2200) + 2200) % 2200) - 1100;
      p.set(x, b.y, b.z);
      s.set(b.sx, b.sy, b.sz);
      m.compose(p, q, s);
      this.clouds.setMatrixAt(i, m);
    }
    this.clouds.instanceMatrix.needsUpdate = true;
  }

  setAtmosphere(name) {
    this.atmosTarget = name && ATMOS[name] ? name : null;
  }

  get isNight() {
    return this.t < 0.24 || this.t > 0.77;
  }

  get hour() {
    return (this.t * 24) % 24;
  }

  sample(t) {
    for (let i = 0; i < KEYS.length - 1; i++) {
      const a = KEYS[i],
        b = KEYS[i + 1];
      if (t >= a.t && t <= b.t) {
        const f = (t - a.t) / (b.t - a.t);
        return { a, b, f };
      }
    }
    return { a: KEYS[0], b: KEYS[1], f: 0 };
  }

  update(dt, focus, camera, viewDist, timeScale = 1) {
    this.t = (this.t + (dt * timeScale) / this.dayLength) % 1;
    const { a, b, f } = this.sample(this.t);
    const L = (x, y) => x + (y - x) * f;
    const u = this.u;
    u.zenith.value.copy(a.zenith).lerp(b.zenith, f);
    u.horizon.value.copy(a.horizon).lerp(b.horizon, f);
    const sunCol = this._tmpA.copy(a.sun).lerp(b.sun, f);
    let sunI = L(a.sunI, b.sunI);
    let hemiI = L(a.hemiI, b.hemiI);
    let amb = L(a.amb, b.amb);
    const hemiSky = this._tmpB.copy(a.hemiSky).lerp(b.hemiSky, f);

    // sun path
    const ang = (this.t - 0.25) * Math.PI * 2; // 0 at sunrise, PI at sunset
    const sunDir = u.sunDir.value.set(Math.cos(ang), Math.sin(ang), 0.35).normalize();
    u.moonDir.value.set(-sunDir.x, Math.max(0.25, -sunDir.y), -0.3).normalize();
    const day = sunDir.y > -0.05;
    u.sunVis.value = THREE.MathUtils.smoothstep(sunDir.y, -0.08, 0.05);
    u.stars.value = 1 - THREE.MathUtils.smoothstep(sunDir.y, -0.15, 0.08);
    const lightDir = day ? sunDir : u.moonDir.value;

    // atmosphere blending
    const target = this.atmosTarget;
    if (target !== this.atmos) {
      this.atmosBlend = Math.max(0, this.atmosBlend - dt * 1.2);
      if (this.atmosBlend <= 0) this.atmos = target;
    } else if (this.atmos) {
      this.atmosBlend = Math.min(1, this.atmosBlend + dt * 0.8);
    }
    const A = this.atmos ? ATMOS[this.atmos] : null;
    const k = A ? this.atmosBlend : 0;

    let fogCol = this._fogCol || (this._fogCol = new THREE.Color());
    fogCol.copy(u.horizon.value);
    let fogNear = Math.min(80, viewDist * 0.2);
    let fogFar = viewDist * 0.95;
    if (A) {
      const nightDim = 0.35 + 0.65 * Math.min(1, amb);
      const af = this._tmpC || (this._tmpC = new THREE.Color());
      af.copy(A.fog).multiplyScalar(this.atmos === 'cave' ? 1 : nightDim);
      fogCol.lerp(af, k);
      fogNear = THREE.MathUtils.lerp(fogNear, A.fogNear, k);
      fogFar = THREE.MathUtils.lerp(fogFar, Math.min(fogFar, A.fogFar), k);
      sunI *= THREE.MathUtils.lerp(1, A.light, k);
      hemiSky.lerp(A.hemi, k * (this.atmos === 'cave' ? 0.85 : 0.5));
      amb *= THREE.MathUtils.lerp(1, A.amb, k);
      u.skyMix.value = THREE.MathUtils.lerp(1, A.sky ? 0.25 : 0, k);
    } else {
      u.skyMix.value = 1;
    }
    u.fogCol.value.copy(fogCol);
    this.fog.color.copy(fogCol);
    this.fog.near = fogNear;
    this.fog.far = fogFar;
    this.scene.background = null;

    this.sun.color.copy(sunCol);
    this.sun.intensity = sunI;
    this.hemi.color.copy(hemiSky);
    this.hemi.groundColor.copy(a.hemiGround).lerp(b.hemiGround, f);
    if (A && this.atmos === 'cave') {
      hemiI = THREE.MathUtils.lerp(hemiI, 1.5, k);
      this.hemi.groundColor.lerp(this._caveGround || (this._caveGround = new THREE.Color('#5a4a7a')), k);
    }
    this.hemi.intensity = hemiI;
    u.sunColor.value.copy(sunCol);
    u.sunSpec.value = day ? 1.6 * u.sunVis.value : 0.4;
    u.ambient.value = amb;
    u.skyReflect.value.copy(u.horizon.value).lerp(u.zenith.value, 0.35).multiplyScalar(0.9);
    u.ground.value.copy(fogCol).multiplyScalar(0.8);

    // light follows the focus point; snap to shadow texels to avoid shimmer
    const dist = 220;
    const tx = focus.x,
      tz = focus.z;
    this.sun.target.position.set(tx, focus.y, tz);
    this.sun.position.set(tx + lightDir.x * dist, focus.y + Math.max(0.15, lightDir.y) * dist, tz + lightDir.z * dist);
    if (this.sun.castShadow && this.shadowTexel) {
      const cam = this.sun.shadow.camera;
      this.sun.updateMatrixWorld();
      this.sun.target.updateMatrixWorld();
      cam.updateMatrixWorld();
      // texel snapping in light space
      const inv = this._inv || (this._inv = new THREE.Matrix4());
      const v = this._v || (this._v = new THREE.Vector3());
      inv.lookAt(this.sun.position, this.sun.target.position, cam.up);
      v.set(tx, focus.y, tz).applyMatrix4(inv.clone().invert());
      const s = this.shadowTexel;
      const dx = Math.round(v.x / s) * s - v.x;
      const dy = Math.round(v.y / s) * s - v.y;
      const off = this._off || (this._off = new THREE.Vector3());
      off.set(dx, dy, 0).applyMatrix4(new THREE.Matrix4().extractRotation(inv));
      this.sun.position.add(off);
      this.sun.target.position.add(off);
    }

    // sky dome follows camera
    const r = Math.min(camera.far * 0.9, 2500);
    this.skyMesh.position.copy(camera.position);
    this.skyMesh.scale.setScalar(r);
    this.updateClouds(dt);
  }
}
