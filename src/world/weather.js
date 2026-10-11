// GPU-animated weather particles (rain, snow, sand, ash, fireflies) and aurora curtains.
// Positions are computed entirely in the vertex shader from instanceIndex + time, wrapped in a
// box that follows the camera: zero per-frame CPU cost and a single draw call per layer.
import * as THREE from 'three/webgpu';
import {
  instanceIndex,
  hash,
  float,
  vec3,
  time,
  uniform,
  fract,
  sin,
  cos,
  positionLocal,
  mod,
  step,
  mix,
  uv,
  smoothstep,
  positionWorld,
} from 'three/tsl';

const LAYERS = {
  rain: { count: 2600, box: [70, 36, 70], fall: 26, drift: 0.4, size: [0.025, 0.85, 0.025], color: [0.7, 0.78, 0.9], add: false, opacity: 0.55 },
  snow: { count: 2200, box: [70, 34, 70], fall: 2.2, drift: 1.6, size: [0.09, 0.09, 0.09], color: [1, 1, 1], add: false, opacity: 0.95 },
  sand: { count: 2600, box: [70, 20, 70], fall: 0.4, drift: 0.6, wind: 18, size: [0.06, 0.04, 0.06], color: [0.86, 0.64, 0.38], add: false, opacity: 0.85 },
  ash: { count: 1400, box: [70, 30, 70], fall: 1.0, drift: 1.2, size: [0.07, 0.07, 0.07], color: [0.25, 0.22, 0.22], add: false, opacity: 0.9 },
  embers: { count: 600, box: [60, 26, 60], fall: -1.6, drift: 1.4, size: [0.06, 0.06, 0.06], color: [1, 0.45, 0.1], add: true, opacity: 1 },
  fireflies: { count: 260, box: [60, 6, 60], fall: 0, drift: 2.5, size: [0.06, 0.06, 0.06], color: [0.75, 1, 0.35], add: true, opacity: 1, ground: true },
  sparkles: { count: 500, box: [60, 20, 60], fall: -0.6, drift: 1.2, size: [0.07, 0.07, 0.07], color: [1, 0.9, 0.4], add: true, opacity: 1 },
  void: { count: 500, box: [60, 20, 60], fall: -1.2, drift: 2.2, size: [0.08, 0.08, 0.08], color: [0.7, 0.35, 1], add: true, opacity: 1 },
};

export class Weather {
  constructor(scene, quality) {
    this.scene = scene;
    this.camPos = uniform(new THREE.Vector3());
    this.groundY = uniform(0);
    this.layers = {};
    const q = quality.particles || 1;
    for (const [name, L] of Object.entries(LAYERS)) {
      const count = Math.round(L.count * Math.min(1.3, q));
      const intensity = uniform(0);
      const geo = new THREE.BoxGeometry(L.size[0], L.size[1], L.size[2]);
      const mat = L.add
        ? new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })
        : new THREE.MeshBasicNodeMaterial({ transparent: L.opacity < 1, depthWrite: L.opacity >= 1 });
      mat.fog = !L.add;
      const i = float(instanceIndex);
      const h1 = hash(i.add(0.5));
      const h2 = hash(i.add(17.31));
      const h3 = hash(i.add(91.7));
      const h4 = hash(i.add(311.1));
      const box = vec3(L.box[0], L.box[1], L.box[2]);
      const t = time;
      let px = h1.mul(box.x).add(sin(t.mul(0.6).add(h4.mul(40))).mul(L.drift));
      let pz = h3.mul(box.z).add(cos(t.mul(0.5).add(h1.mul(30))).mul(L.drift));
      if (L.wind) px = px.add(t.mul(L.wind).mul(h4.mul(0.5).add(0.75)));
      let py = h2.mul(box.y).sub(t.mul(L.fall).mul(h4.mul(0.4).add(0.8)));
      // wrap into a camera-centered box
      const origin = this.camPos.sub(box.mul(0.5));
      const rx = mod(px.sub(origin.x), box.x);
      const ry = mod(py.sub(origin.y), box.y);
      const rz = mod(pz.sub(origin.z), box.z);
      // visibility from intensity (instances above the threshold collapse to zero size)
      const vis = step(h4, intensity);
      let world = vec3(origin.x.add(rx), origin.y.add(ry), origin.z.add(rz));
      if (L.ground) world = vec3(world.x, this.groundY.add(h2.mul(L.box[1])).add(sin(t.mul(1.3).add(h1.mul(50))).mul(0.6)), world.z);
      let scale = vis;
      if (name === 'fireflies' || name === 'sparkles' || name === 'void') scale = vis.mul(sin(t.mul(3).add(h1.mul(60))).mul(0.5).add(0.6));
      mat.positionNode = positionLocal.mul(scale).add(world);
      mat.colorNode = vec3(L.color[0], L.color[1], L.color[2]);
      if (L.opacity < 1 && !L.add) mat.opacityNode = float(L.opacity);
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.name = 'weather-' + name;
      scene.add(mesh);
      this.layers[name] = { mesh, intensity, target: 0, value: 0 };
    }
    this.buildAurora();
  }

  buildAurora() {
    const geo = new THREE.PlaneGeometry(900, 120, 64, 1);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    mat.fog = false;
    this.auroraI = uniform(0);
    const u = uv();
    const wave = sin(u.x.mul(18).add(time.mul(0.4))).mul(0.5).add(0.5);
    const wave2 = sin(u.x.mul(43).sub(time.mul(0.7))).mul(0.5).add(0.5);
    const band = smoothstep(0.0, 0.35, u.y).mul(float(1).sub(smoothstep(0.45, 1.0, u.y)));
    const col = mix(vec3(0.2, 1.0, 0.6), vec3(0.7, 0.3, 1.0), u.y.add(wave.mul(0.3)));
    mat.colorNode = col.mul(band).mul(wave.mul(0.6).add(wave2.mul(0.4))).mul(this.auroraI).mul(0.9);
    mat.positionNode = positionLocal.add(vec3(0, 0, sin(positionLocal.x.mul(0.012).add(time.mul(0.2))).mul(40)));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(0, 330, -700);
    mesh.rotation.x = -0.35;
    mesh.visible = false;
    mesh.frustumCulled = false;
    this.scene.add(mesh);
    this.aurora = mesh;
    this.auroraVal = 0;
    this.auroraTarget = 0;
  }

  set(name, target) {
    if (this.layers[name]) this.layers[name].target = target;
  }

  clearAll() {
    for (const l of Object.values(this.layers)) l.target = 0;
  }

  update(dt, camPos, groundY) {
    this.camPos.value.copy(camPos);
    this.groundY.value = groundY;
    for (const l of Object.values(this.layers)) {
      l.value += (l.target - l.value) * Math.min(1, dt * 0.6);
      if (Math.abs(l.value - l.target) < 0.01) l.value = l.target;
      l.intensity.value = l.value;
      l.mesh.visible = l.value > 0.01;
    }
    this.auroraVal += (this.auroraTarget - this.auroraVal) * Math.min(1, dt * 0.3);
    this.auroraI.value = this.auroraVal;
    this.aurora.visible = this.auroraVal > 0.01;
  }
}
