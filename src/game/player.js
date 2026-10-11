// Player character controller + third-person orbit camera.
import * as THREE from 'three/webgpu';
import { CAVERN } from '../world/layout.js';

const GRAVITY = 32;
const JUMP_V = 10.5;
const RADIUS = 0.45;
const HEIGHT = 2.0;
const MAX_STEP = 0.65;
const MAX_SLOPE = 1.25; // rise per meter

export class Player {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.vy = 0;
    this.yaw = 0;
    this.onGround = true;
    this.swimming = false;
    this.inWater = false;
    this.waterDepth = 0;
    this.camYaw = 0;
    this.camPitch = 0.38;
    this.camDist = 11;
    this.camTarget = new THREE.Vector3();
    this.camPos = new THREE.Vector3();
    this.lastManualLook = 0;
    this.locked = false; // when UI panels or actions lock movement
    this.char = {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      look: { shirt: '#3a86ff', pants: '#2b2d42', skin: '#f2c49b', hat: 'cowboy', hatColor: '#8a5a2b', face: 0 },
      tool: 'shovel',
      panFill: 0,
      isPlayer: true,
      name: 'You',
    };
    this.tmp = { x: 0, z: 0, hit: false };
    this.airTime = 0;
    this.stepTimer = 0;
  }

  spawn(x, z, yaw = 0) {
    const g = this.world.groundAt(x, z);
    this.pos.set(x, g, z);
    this.yaw = yaw;
    this.camYaw = yaw + Math.PI;
    this.vy = 0;
  }

  groundAt(x, z, y) {
    let g = this.world.groundAt(x, z, y);
    const p = this.game.colliders.platformAt(x, z, y);
    if (p > g) g = p;
    return g;
  }

  update(dt, input, look) {
    const w = this.world;
    const stats = this.game.stats;
    // camera input
    this.camYaw -= look.look.dx;
    this.camPitch = THREE.MathUtils.clamp(this.camPitch + look.look.dy, -0.35, 1.35);
    this.camDist = THREE.MathUtils.clamp(this.camDist + look.zoom, 3, 42);
    if (look.look.dx || look.look.dy) this.lastManualLook = performance.now();

    // movement intent
    let mx = this.locked ? 0 : input.move.x;
    let mz = this.locked ? 0 : input.move.y;
    const moving = Math.hypot(mx, mz) > 0.05;
    const base = 9 * (stats?.walkMult || 1);
    let speed = base * (input.sprint ? 1.45 : 1);
    if (this.swimming) speed *= 0.55;
    else if (this.inWater) speed *= 0.82;
    const sin = Math.sin(this.camYaw),
      cos = Math.cos(this.camYaw);
    // camera forward on ground = -(sin, cos) since camera sits at +dir from player
    const fx = -sin,
      fz = -cos;
    const rx = -fz,
      rz = fx;
    let dvx = (fx * -mz + rx * mx) * speed;
    let dvz = (fz * -mz + rz * mx) * speed;
    const accel = this.onGround || this.swimming ? 14 : 4;
    this.vel.x += (dvx - this.vel.x) * Math.min(1, accel * dt);
    this.vel.z += (dvz - this.vel.z) * Math.min(1, accel * dt);
    if (moving) {
      const targetYaw = Math.atan2(this.vel.x, this.vel.z);
      let d = targetYaw - this.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw += d * Math.min(1, dt * 12);
    }

    // horizontal move with slope + collision
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    const curG = this.groundAt(this.pos.x, this.pos.z, this.pos.y);
    const newG = this.groundAt(nx, nz, this.pos.y + MAX_STEP);
    const dist = Math.hypot(nx - this.pos.x, nz - this.pos.z);
    if (this.onGround && !this.swimming && dist > 1e-4) {
      const rise = newG - Math.max(curG, this.pos.y);
      if (rise > MAX_STEP && rise / dist > MAX_SLOPE * 3) {
        // blocked by a steep wall: try sliding along axes
        const gX = this.groundAt(nx, this.pos.z, this.pos.y + MAX_STEP);
        const gZ = this.groundAt(this.pos.x, nz, this.pos.y + MAX_STEP);
        if (gX - this.pos.y < MAX_STEP) nz = this.pos.z;
        else if (gZ - this.pos.y < MAX_STEP) nx = this.pos.x;
        else {
          nx = this.pos.x;
          nz = this.pos.z;
        }
      } else if (rise > 0 && rise / dist > MAX_SLOPE) {
        // too steep to walk up: slow down heavily
        nx = this.pos.x + (nx - this.pos.x) * 0.15;
        nz = this.pos.z + (nz - this.pos.z) * 0.15;
      }
    }
    this.game.colliders.resolve(nx, nz, RADIUS, this.pos.y, HEIGHT, this.tmp);
    nx = this.tmp.x;
    nz = this.tmp.z;
    // world bounds
    const lim = w.half - 6;
    nx = THREE.MathUtils.clamp(nx, -lim, lim);
    nz = THREE.MathUtils.clamp(nz, -lim, lim);

    // gating barriers (bridge out, rockfall, sealed heart)
    const barrier = this.game.checkBarrier(nx, nz);
    if (barrier) {
      nx = this.pos.x + barrier.px * dt * 6;
      nz = this.pos.z + barrier.pz * dt * 6;
      this.vel.x = barrier.px * 4;
      this.vel.z = barrier.pz * 4;
    }
    this.pos.x = nx;
    this.pos.z = nz;

    // vertical
    const ground = this.groundAt(nx, nz, this.pos.y + MAX_STEP);
    const wl = w.waterAt(nx, nz);
    const wt = w.waterTypeAt(nx, nz);
    this.waterDepth = wl > -900 ? wl - ground : 0;
    this.inWater = this.waterDepth > 0.12 && wt !== 4;
    this.inLava = wl > -900 && wt === 4 && this.waterDepth > 0.05 && this.pos.y < wl + 0.2;
    const swimDepth = 1.45;
    this.swimming = this.inWater && this.waterDepth > swimDepth;
    if (this.swimming) {
      const target = wl - 1.25;
      this.vy = 0;
      this.pos.y += (target - this.pos.y) * Math.min(1, dt * 6);
      if (look.jump) this.pos.y = Math.min(this.pos.y + 0.4, wl - 0.6);
      this.onGround = false;
      this.airTime = 0;
    } else {
      if (look.jump && (this.onGround || this.airTime < 0.12) && !this.locked) {
        this.vy = JUMP_V * (stats?.jumpMult || 1);
        this.onGround = false;
        this.airTime = 1;
        this.game.audio?.play('jump');
      }
      this.vy -= GRAVITY * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= ground) {
        if (!this.onGround && this.vy < -14) this.game.audio?.play('land');
        this.pos.y = ground;
        this.vy = 0;
        this.onGround = true;
        this.airTime = 0;
      } else if (this.pos.y - ground < 0.25 && this.vy <= 0 && this.onGround) {
        // stick to slopes going down
        this.pos.y = ground;
        this.vy = 0;
      } else {
        this.onGround = false;
        this.airTime += dt;
      }
    }

    // animation state
    const hs = Math.hypot(this.vel.x, this.vel.z);
    const c = this.char;
    const a = (c.anim ||= { state: 'idle', t: 0, phase: 0 });
    let state = 'idle';
    if (this.swimming) state = 'swim';
    else if (!this.onGround && this.airTime > 0.08) state = this.vy > 0 ? 'jump' : 'fall';
    else if (hs > 0.6) state = hs > 11 ? 'run' : 'walk';
    if (this.actionAnim && !this.swimming) state = this.actionAnim;
    if (a.state !== state) {
      a.state = state;
      a.t = 0;
    }
    a.phase += hs * dt * 1.15;
    c.x = this.pos.x;
    c.y = this.pos.y;
    c.z = this.pos.z;
    c.yaw = this.yaw;

    // footsteps
    if (this.onGround && hs > 1 && !this.actionAnim) {
      this.stepTimer -= dt * hs;
      if (this.stepTimer <= 0) {
        this.stepTimer = 3.2;
        this.game.audio?.play(this.inWater ? 'splashStep' : 'step');
      }
    }
  }

  updateCamera(dt, camera, input) {
    const w = this.world;
    // auto-follow behind when moving and no recent manual look
    const now = performance.now();
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.game.settings.autoCamera !== false && hs > 2 && now - this.lastManualLook > 2500 && !input.touch) {
      let target = this.yaw + Math.PI;
      let d = target - this.camYaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      // only follow when roughly moving away from camera
      if (Math.abs(d) < 2.2) this.camYaw += d * Math.min(1, dt * 1.2);
    }
    const head = this.pos.y + 1.7;
    this.camTarget.set(this.pos.x, head, this.pos.z);
    let dist = this.camDist;
    const cp = Math.cos(this.camPitch);
    let cx = this.pos.x + Math.sin(this.camYaw) * cp * dist;
    let cz = this.pos.z + Math.cos(this.camYaw) * cp * dist;
    let cy = head + Math.sin(this.camPitch) * dist;
    // terrain collision: step along the ray and pull in
    for (let i = 1; i <= 8; i++) {
      const t = i / 8;
      const x = this.pos.x + (cx - this.pos.x) * t;
      const z = this.pos.z + (cz - this.pos.z) * t;
      const y = head + (cy - head) * t;
      const g = w.groundAt(x, z, y) + 0.5;
      if (y < g) {
        const tt = Math.max(0.15, t - 0.12);
        cx = this.pos.x + (cx - this.pos.x) * tt;
        cz = this.pos.z + (cz - this.pos.z) * tt;
        cy = Math.max(head + (cy - head) * tt, g);
        break;
      }
    }
    // pull in front of buildings / trees / rocks
    const cols = this.game.colliders;
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const x = this.pos.x + (cx - this.pos.x) * t;
      const z = this.pos.z + (cz - this.pos.z) * t;
      const y = head + (cy - head) * t;
      if (cols.pointBlocked(x, z, y)) {
        const tt = Math.max(0.12, t - 0.1);
        cx = this.pos.x + (cx - this.pos.x) * tt;
        cz = this.pos.z + (cz - this.pos.z) * tt;
        cy = head + (cy - head) * tt;
        break;
      }
    }
    const gEnd = w.groundAt(cx, cz) + 0.6;
    if (cy < gEnd) cy = gEnd;
    // inside the cavern dome: keep camera under the roof
    const kd = Math.hypot(cx - CAVERN.x, cz - CAVERN.z);
    if (this.game.inCave && kd < CAVERN.r) {
      const roofH = CAVERN.floor - 6 + (CAVERN.roof - CAVERN.floor + 8) * Math.sqrt(Math.max(0, 1 - (kd / (CAVERN.r + 4)) ** 2)) - 3;
      if (cy > roofH) cy = Math.max(head + 0.3, roofH);
    }
    // smooth
    const k = Math.min(1, dt * 14);
    this.camPos.x += (cx - this.camPos.x) * k;
    this.camPos.y += (cy - this.camPos.y) * k;
    this.camPos.z += (cz - this.camPos.z) * k;
    if (this.camPos.distanceTo(this.camTarget) > 60) this.camPos.set(cx, cy, cz);
    camera.position.copy(this.camPos);
    camera.lookAt(this.camTarget);
  }
}
