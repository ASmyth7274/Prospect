// World events (global) + location events (per region) and their gameplay effects/visuals.
import * as THREE from 'three/webgpu';
import { vec3, time, sin, uv, uniform, smoothstep, float, mix, atan, length, vec2, fract } from 'three/tsl';
import { CALDERA } from '../world/layout.js';
import { SITES } from '../data/sites.js';

export const EVENT_DEFS = {
  meteor_shower: { name: 'Meteor Shower', icon: '☄️', global: true, dur: 240, cooldown: [360, 780], night: true, color: '#b76bff', desc: 'Luck x2 • Meteor Shards x3 • Dig the impact craters!' },
  solar_flare: { name: 'Solar Flare', icon: '☀️', global: true, dur: 180, cooldown: [420, 900], day: true, color: '#ffb22e', desc: 'Dig inside flare patches for heavy, Electrified minerals' },
  river_rapids: { name: 'River Rapids', icon: '🌊', global: true, dur: 240, cooldown: [420, 840], color: '#4aa8ff', desc: 'Fortune River & Delta: x2 weight, x1.5 modifiers' },
  mythic_rift: { name: 'Mythic Rift', icon: '🌀', global: true, dur: 200, cooldown: [1100, 2100], color: '#c77dff', desc: 'A rift tore open! Dig beside it for Mythic & Voidtorn finds' },
  lucky_breeze: { name: 'Lucky Breeze', icon: '🍀', global: true, dur: 180, cooldown: [500, 1000], color: '#5fe36a', desc: 'Server Luck x1.5' },
  rain: { name: 'Rainstorm', icon: '🌧️', regions: ['rubble', 'deposits', 'fortune', 'delta', 'wilds', 'sunset'], dur: 300, cooldown: [360, 720], color: '#7d8a99', desc: 'Geodes x2 • Shake Speed +15%' },
  sandstorm: { name: 'Sandstorm', icon: '🏜️', regions: ['desert', 'oasis', 'ruins'], dur: 240, cooldown: [360, 720], color: '#d49a5a', desc: 'Desert minerals x1.6 size • Hard to see!' },
  blizzard: { name: 'Blizzard', icon: '❄️', regions: ['frostbite', 'peak', 'mountains'], dur: 240, cooldown: [360, 720], color: '#bfeaff', desc: 'Frosted x5 • Exotics x2 • Stay near a fire!' },
  eruption: { name: 'Eruption', icon: '🌋', regions: ['caldera', 'furnace', 'infernal'], dur: 180, cooldown: [420, 840], color: '#ff4a1c', desc: 'Scorching x4 • Furnace sizes x1.5 • Lava bombs!' },
  aurora: { name: 'Aurora', icon: '🌌', regions: ['frostbite', 'peak', 'mountains'], night: true, dur: 300, cooldown: [240, 600], color: '#5cffb0', desc: 'Frozen sites: Luck x1.5 • Aurora Crystals x3' },
  low_tide: { name: 'Low Tide', icon: '🐚', regions: ['sunset', 'windswept', 'lighthouse'], dur: 300, cooldown: [360, 720], color: '#ffe9d6', desc: 'Beaches: Rare+ x1.6' },
};

const FROZEN_SITES = ['frostbite_falls', 'frozen_peak'];
const DESERT_SITES = ['azuralite_oasis', 'sunscorched_dunes', 'ancient_ruins'];
const VOLCANO_SITES = ['volcanic_sands', 'magma_furnace', 'infernal_heart'];
const BEACH_SITES = ['sunset_beach', 'windswept_beach'];
const RIVER_SITES = ['fortune_river', 'fortune_delta'];

export const INFERNAL_CYCLE = 900; // seconds
export const INFERNAL_OPEN = 240;

export class Events {
  constructor(game) {
    this.game = game;
    this.active = {}; // id -> {t, dur}
    this.next = {};
    for (const [id, d] of Object.entries(EVENT_DEFS)) this.next[id] = 60 + Math.random() * (d.cooldown[0] * 0.8);
    this.next.lucky_breeze = 45;
    this.clock = 0;
    this.flares = [];
    this.craters = [];
    this.rift = null;
    this.bombs = [];
    this.meteors = [];
    this.skyMeteorTimer = 0;
    this.buildVisuals();
  }

  buildVisuals() {
    const scene = this.game.scene;
    // ground rings (flare patches / craters)
    const ringGeo = new THREE.RingGeometry(0.85, 1, 48, 1);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringPool = [];
    for (let i = 0; i < 8; i++) {
      const col = uniform(new THREE.Color(1, 0.8, 0.2));
      const op = uniform(1);
      const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      mat.fog = false;
      mat.colorNode = col.mul(op).mul(sin(time.mul(4)).mul(0.25).add(0.85));
      const m = new THREE.Mesh(ringGeo, mat);
      m.visible = false;
      m.renderOrder = 3;
      scene.add(m);
      const fillGeo = new THREE.CircleGeometry(1, 40);
      fillGeo.rotateX(-Math.PI / 2);
      const fmat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      fmat.fog = false;
      const r = uv().sub(0.5).length().mul(2);
      fmat.colorNode = col.mul(op).mul(float(0.22)).mul(smoothstep(1.0, 0.2, r)).mul(sin(time.mul(3).add(r.mul(12))).mul(0.3).add(0.7));
      const f = new THREE.Mesh(fillGeo, fmat);
      f.visible = false;
      f.renderOrder = 3;
      scene.add(f);
      this.ringPool.push({ ring: m, fill: f, col, op, used: false });
    }
    // meteorite rocks (pool)
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshBasicNodeMaterial();
    rockMat.colorNode = mix(vec3(0.18, 0.12, 0.1), vec3(1.0, 0.45, 0.1), sin(time.mul(3)).mul(0.25).add(0.35));
    this.rockPool = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(rockGeo, rockMat);
      m.visible = false;
      m.scale.setScalar(0.9);
      scene.add(m);
      this.rockPool.push(m);
    }
    // meteor heads
    const headGeo = new THREE.IcosahedronGeometry(1, 1);
    const headMat = new THREE.MeshBasicNodeMaterial();
    headMat.colorNode = vec3(1, 0.75, 0.35);
    headMat.fog = false;
    this.headPool = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(headGeo, headMat);
      m.visible = false;
      scene.add(m);
      this.headPool.push(m);
    }
    // rift portal
    const riftGeo = new THREE.CircleGeometry(1, 48);
    const riftMat = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false });
    riftMat.fog = false;
    const p = uv().sub(0.5).mul(2);
    const rr = length(p);
    const ang = atan(p.y, p.x);
    const swirl = sin(ang.mul(5).add(rr.mul(14)).sub(time.mul(4))).mul(0.5).add(0.5);
    const core = smoothstep(0.55, 0.0, rr);
    riftMat.colorNode = mix(vec3(0.45, 0.1, 0.9), vec3(0.1, 0.9, 1.0), swirl).mul(smoothstep(1.0, 0.6, rr)).add(vec3(core));
    riftMat.opacityNode = smoothstep(1.0, 0.7, rr);
    this.riftMesh = new THREE.Mesh(riftGeo, riftMat);
    this.riftMesh.visible = false;
    scene.add(this.riftMesh);
    const torus = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 48), new THREE.MeshBasicNodeMaterial({ color: 0xd9a8ff }));
    this.riftRing = torus;
    torus.visible = false;
    scene.add(torus);
  }

  isActive(id) {
    return !!this.active[id];
  }

  regionOf(areaId) {
    return areaId;
  }

  // events relevant to an area id
  activeFor(areaId) {
    const out = [];
    for (const id in this.active) {
      const d = EVENT_DEFS[id];
      if (d.global || (d.regions && d.regions.includes(areaId))) out.push(id);
    }
    return out;
  }

  get infernalAwake() {
    return this.clock % INFERNAL_CYCLE < INFERNAL_OPEN;
  }

  get infernalRemaining() {
    const t = this.clock % INFERNAL_CYCLE;
    return t < INFERNAL_OPEN ? INFERNAL_OPEN - t : INFERNAL_CYCLE - t;
  }

  start(id) {
    const d = EVENT_DEFS[id];
    if (!d || this.active[id]) return;
    this.active[id] = { t: 0, dur: d.dur };
    const g = this.game;
    g.ui?.eventStarted(id, d);
    g.audio?.play('event');
    if (id === 'mythic_rift') this.spawnRift();
    if (id === 'solar_flare') this.flareTimer = 0;
  }

  end(id) {
    delete this.active[id];
    const d = EVENT_DEFS[id];
    this.next[id] = this.clock + d.cooldown[0] + Math.random() * (d.cooldown[1] - d.cooldown[0]);
    this.game.ui?.eventEnded(id, d);
    if (id === 'mythic_rift' && this.rift) {
      this.rift = null;
      this.riftMesh.visible = this.riftRing.visible = false;
    }
    if (id === 'solar_flare') for (const f of this.flares) this.freeRing(f.ring);
    if (id === 'solar_flare') this.flares = [];
  }

  takeRing() {
    const r = this.ringPool.find((x) => !x.used);
    if (!r) return null;
    r.used = true;
    r.ring.visible = r.fill.visible = true;
    return r;
  }

  freeRing(r) {
    if (!r) return;
    r.used = false;
    r.ring.visible = r.fill.visible = false;
  }

  // pick a land point near the player that isn't water/too steep
  pickLandNear(x, z, rmin, rmax, tries = 30) {
    const w = this.game.world;
    for (let i = 0; i < tries; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = rmin + Math.random() * (rmax - rmin);
      const px = x + Math.cos(a) * r,
        pz = z + Math.sin(a) * r;
      if (Math.abs(px) > w.half - 20 || Math.abs(pz) > w.half - 20) continue;
      const h = w.heightAt(px, pz);
      if (h < 0.8 || w.waterAt(px, pz) > h - 0.3) continue;
      const n = w.normalAt(px, pz);
      if (n.y < 0.85) continue;
      if (this.game.inCaveAt(px, pz)) continue;
      const area = w.areaAt(px, pz);
      if (area.flag && !this.game.save.flags[area.flag]) continue;
      return { x: px, z: pz, y: h };
    }
    return null;
  }

  spawnRift() {
    const p = this.game.player.pos;
    const spot = this.pickLandNear(p.x, p.z, 60, 220) || this.pickLandNear(p.x, p.z, 20, 120);
    if (!spot) return;
    this.rift = { x: spot.x, z: spot.z, y: spot.y, r: 18 };
    this.riftMesh.position.set(spot.x, spot.y + 5, spot.z);
    this.riftMesh.scale.setScalar(4.5);
    this.riftRing.position.copy(this.riftMesh.position);
    this.riftRing.scale.setScalar(4.6);
    this.riftMesh.visible = this.riftRing.visible = true;
    this.game.chat?.system(`🌀 A Mythic Rift opened near ${this.game.world.areaAt(spot.x, spot.z).name}!`);
  }

  spawnFlare() {
    const p = this.game.player.pos;
    const spot = this.pickLandNear(p.x, p.z, 25, 110);
    if (!spot) return;
    const ring = this.takeRing();
    if (!ring) return;
    const r = 7;
    ring.col.value.set('#ffb22e');
    ring.ring.position.set(spot.x, spot.y + 0.15, spot.z);
    ring.ring.scale.setScalar(r);
    ring.fill.position.copy(ring.ring.position);
    ring.fill.scale.setScalar(r);
    this.flares.push({ x: spot.x, z: spot.z, y: spot.y, r, t: 0, life: 60, ring });
  }

  spawnMeteorImpact() {
    const p = this.game.player.pos;
    const spot = this.pickLandNear(p.x, p.z, 30, 160);
    if (!spot) return;
    const head = this.headPool.find((m) => !m.visible);
    if (!head) return;
    const from = new THREE.Vector3(spot.x - 180 + Math.random() * 60, spot.y + 260, spot.z - 120 + Math.random() * 60);
    head.visible = true;
    head.scale.setScalar(1.6);
    this.meteors.push({ head, from, to: new THREE.Vector3(spot.x, spot.y, spot.z), t: 0, dur: 2.2, impact: true });
  }

  impact(m) {
    const g = this.game;
    const { x, y, z } = m.to;
    g.vfx.burst('meteor', x, y, z, { n: 40 });
    g.audio.play('meteor');
    const d = g.player.pos.distanceTo(m.to);
    if (d < 120) g.shake(Math.max(0.15, 1.2 - d / 100));
    const ring = this.takeRing();
    if (ring) {
      ring.col.value.set('#ff7a3c');
      ring.ring.position.set(x, y + 0.15, z);
      ring.ring.scale.setScalar(6);
      ring.fill.position.copy(ring.ring.position);
      ring.fill.scale.setScalar(6);
    }
    const rock = this.rockPool.find((r) => !r.visible);
    if (rock) {
      rock.visible = true;
      rock.position.set(x, y + 0.3, z);
      rock.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    }
    this.craters.push({ x, z, y, r: 6, t: 0, life: 100, ring, rock });
    g.chat?.system('☄️ A meteor crashed nearby! Dig the crater for Meteoric Iron & Starshine!');
  }

  launchBomb() {
    const g = this.game;
    const p = g.player.pos;
    let tx, tz;
    if (Math.hypot(p.x - CALDERA.x, p.z - CALDERA.z) < 220 && Math.random() < 0.6) {
      tx = p.x + (Math.random() - 0.5) * 40;
      tz = p.z + (Math.random() - 0.5) * 40;
    } else {
      const a = Math.random() * Math.PI * 2;
      const r = 40 + Math.random() * 120;
      tx = CALDERA.x + Math.cos(a) * r;
      tz = CALDERA.z + Math.sin(a) * r;
    }
    const head = this.headPool.find((m) => !m.visible);
    if (!head) return;
    head.visible = true;
    head.scale.setScalar(0.8);
    const ty = g.world.heightAt(tx, tz);
    this.meteors.push({ head, from: new THREE.Vector3(CALDERA.x, 95, CALDERA.z), to: new THREE.Vector3(tx, ty, tz), t: 0, dur: 2.8, arc: 60, bomb: true });
  }

  update(dt) {
    const g = this.game;
    this.clock += dt;
    // schedule
    for (const [id, d] of Object.entries(EVENT_DEFS)) {
      if (this.active[id]) {
        const a = this.active[id];
        a.t += dt;
        if (a.t >= a.dur || (d.night && !g.env.isNight && id === 'meteor_shower' && a.t > 30)) this.end(id);
        continue;
      }
      if (this.clock < this.next[id]) continue;
      if (d.night && !g.env.isNight) continue;
      if (d.day && g.env.isNight) continue;
      // keep at most 2 global events at once
      if (d.global && Object.keys(this.active).filter((k) => EVENT_DEFS[k].global).length >= 2) {
        this.next[id] = this.clock + 60;
        continue;
      }
      this.start(id);
    }
    // infernal heart status changes
    const awake = this.infernalAwake;
    if (awake !== this._lastAwake) {
      if (this._lastAwake !== undefined && g.save.flags.infernal_access) g.chat?.system(awake ? '🔥 The Infernal Heart has awakened! Dig while it burns!' : '🔥 The Infernal Heart falls dormant...');
      this._lastAwake = awake;
    }

    // meteor shower: sky meteors + impacts
    if (this.active.meteor_shower) {
      this.skyMeteorTimer -= dt;
      if (this.skyMeteorTimer <= 0) {
        this.skyMeteorTimer = 0.25 + Math.random() * 0.6;
        const p = g.player.pos;
        const sx = p.x + (Math.random() - 0.5) * 600,
          sz = p.z - 200 - Math.random() * 300;
        const head = this.headPool.find((m) => !m.visible);
        if (head) {
          head.visible = true;
          head.scale.setScalar(2.4);
          this.meteors.push({ head, from: new THREE.Vector3(sx, 300, sz), to: new THREE.Vector3(sx + 160, 180, sz + 90), t: 0, dur: 1.4, sky: true });
        }
      }
      this.impactTimer = (this.impactTimer ?? 15) - dt;
      if (this.impactTimer <= 0 && this.craters.length < 3) {
        this.impactTimer = 45 + Math.random() * 30;
        this.spawnMeteorImpact();
      }
    }
    // solar flare patches
    if (this.active.solar_flare) {
      this.flareTimer = (this.flareTimer ?? 0) - dt;
      if (this.flareTimer <= 0 && this.flares.length < 3) {
        this.flareTimer = 18;
        this.spawnFlare();
      }
    }
    for (const f of this.flares) {
      f.t += dt;
      f.ring.op.value = Math.min(1, f.t) * (f.t > f.life - 5 ? (f.life - f.t) / 5 : 1);
      if (Math.random() < dt * 6) g.vfx.burst('sparkle', f.x + (Math.random() - 0.5) * f.r * 1.4, f.y + 0.3, f.z + (Math.random() - 0.5) * f.r * 1.4, { n: 2, color: '#ffd23f' });
    }
    this.flares = this.flares.filter((f) => {
      if (f.t >= f.life) {
        this.freeRing(f.ring);
        return false;
      }
      return true;
    });
    for (const c of this.craters) {
      c.t += dt;
      if (c.ring) c.ring.op.value = c.t > c.life - 8 ? Math.max(0, (c.life - c.t) / 8) : 1;
      if (Math.random() < dt * 3) g.vfx.burst('smoke', c.x, c.y + 0.6, c.z, { alpha: 0.3 });
    }
    this.craters = this.craters.filter((c) => {
      if (c.t >= c.life) {
        this.freeRing(c.ring);
        if (c.rock) c.rock.visible = false;
        return false;
      }
      return true;
    });
    // eruption bombs
    if (this.active.eruption) {
      this.bombTimer = (this.bombTimer ?? 2) - dt;
      if (this.bombTimer <= 0) {
        this.bombTimer = 1.5 + Math.random() * 2.5;
        this.launchBomb();
      }
      if (Math.random() < dt * 20) g.vfx.burst('ember', CALDERA.x + (Math.random() - 0.5) * 30, 90, CALDERA.z + (Math.random() - 0.5) * 30);
    }
    // animate meteors / bombs
    for (const m of this.meteors) {
      m.t += dt;
      const k = Math.min(1, m.t / m.dur);
      const pos = m.head.position.lerpVectors(m.from, m.to, k);
      if (m.arc) pos.y += Math.sin(k * Math.PI) * m.arc;
      g.vfx.burst('trail', pos.x, pos.y, pos.z, { color: m.bomb ? '#ff5a1a' : '#ffb870', size: m.bomb ? 0.7 : m.sky ? 2.6 : 1.4, life: m.sky ? 0.9 : 0.6 });
      if (k >= 1) {
        m.head.visible = false;
        m.done = true;
        if (m.impact) this.impact(m);
        if (m.bomb) {
          g.vfx.burst('meteor', m.to.x, m.to.y, m.to.z, { n: 14 });
          const d = Math.hypot(g.player.pos.x - m.to.x, g.player.pos.z - m.to.z);
          if (d < 5) g.status.applyBurn(6);
          if (d < 60) g.audio.play('burn');
        }
      }
    }
    this.meteors = this.meteors.filter((m) => !m.done);
    // rift
    if (this.rift) {
      const t = this.clock;
      this.riftMesh.lookAt(g.camera.position);
      this.riftRing.lookAt(g.camera.position);
      this.riftMesh.scale.setScalar(4.5 + Math.sin(t * 2) * 0.3);
      if (Math.random() < dt * 25) {
        const a = Math.random() * Math.PI * 2;
        g.vfx.glow.spawn({ x: this.rift.x + Math.cos(a) * 6, y: this.rift.y + 1 + Math.random() * 8, z: this.rift.z + Math.sin(a) * 6, vx: -Math.cos(a) * 3, vy: 0, vz: -Math.sin(a) * 3, g: 0, drag: 0, life: 1.6, size: 0.12, sizeEnd: 0, color: new THREE.Color(0.75, 0.4, 1) });
      }
    }
  }

  // Dynamic dig site override (crater / rift)
  dynamicSiteAt(x, z) {
    for (const c of this.craters) if (Math.hypot(x - c.x, z - c.z) < c.r) return 'meteor_crater';
    if (this.rift && Math.hypot(x - this.rift.x, z - this.rift.z) < this.rift.r) return 'mythic_rift';
    return null;
  }

  inFlare(x, z) {
    return this.flares.some((f) => Math.hypot(x - f.x, z - f.z) < f.r);
  }

  // Gameplay modifiers for a dig at (x,z) on siteId
  digContext(siteId, x, z) {
    const ctx = { luckMult: 1, siteSize: 1, mods: {}, tierMult: null, shardMult: 1, geodeMult: 1, extraLuck: 1 };
    const A = this.active;
    if (A.meteor_shower) {
      ctx.luckMult *= 2;
      ctx.shardMult *= 3;
      ctx.mods.irradiated = (ctx.mods.irradiated || 1) * 2;
    }
    if (A.lucky_breeze) ctx.luckMult *= 1.5;
    if (A.solar_flare && this.inFlare(x, z)) {
      ctx.siteSize *= 2;
      ctx.mods.electrified = 6;
      ctx.mods.glowing = 3;
      ctx.inFlare = true;
    }
    if (A.river_rapids && RIVER_SITES.includes(siteId)) {
      ctx.siteSize *= 2;
      for (const k of ['shiny', 'pure', 'glowing', 'iridescent']) ctx.mods[k] = (ctx.mods[k] || 1) * 1.5;
    }
    if (A.rain && ['rubble_sands', 'rubble_deposits', 'fortune_river', 'fortune_delta', 'sunset_beach'].includes(siteId)) ctx.geodeMult *= 2;
    if (A.sandstorm && DESERT_SITES.includes(siteId)) ctx.siteSize *= 1.6;
    if (A.blizzard && FROZEN_SITES.includes(siteId)) {
      ctx.mods.frosted = 5;
      ctx.tierMult = { 6: 2 };
    }
    if (A.eruption && VOLCANO_SITES.includes(siteId)) {
      ctx.mods.scorching = 4;
      if (siteId === 'magma_furnace') ctx.siteSize *= 1.5;
    }
    if (A.aurora && FROZEN_SITES.includes(siteId)) {
      ctx.luckMult *= 1.5;
      ctx.auroraBoost = true;
    }
    if (A.low_tide && BEACH_SITES.includes(siteId)) ctx.tierMult = { 2: 1.6, 3: 1.6, 4: 1.6, 5: 1.6, 6: 1.6 };
    if (VOLCANO_SITES.includes(siteId)) ctx.mods.scorching = (ctx.mods.scorching || 1) * 3;
    if (siteId === 'mythic_rift') ctx.mods.voidtorn = 20;
    if (siteId === 'meteor_crater') ctx.mods.irradiated = (ctx.mods.irradiated || 1) * 4;
    ctx.cold = FROZEN_SITES.includes(siteId);
    return ctx;
  }

  globalLuckMult() {
    let m = 1;
    if (this.active.meteor_shower) m *= 2;
    if (this.active.lucky_breeze) m *= 1.5;
    return m;
  }
}

export { FROZEN_SITES, DESERT_SITES, VOLCANO_SITES };
