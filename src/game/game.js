// Game orchestrator: owns the scene, world, systems, and the per-frame loop.
import * as THREE from 'three/webgpu';
import { ResolutionController, QUALITY_PRESETS } from '../engine/renderer.js';
import { Input } from '../engine/input.js';
import { Audio } from '../engine/audio.js';
import { VFX } from '../engine/vfx.js';
import { makeDetailTexture, makeWaterNormalTexture } from '../engine/textures.js';
import { WorldData } from '../world/worldgen.js';
import { worldCacheKey, loadWorldCache, saveWorldCache } from '../world/cache.js';
import { Terrain } from '../world/terrain.js';
import { Water } from '../world/water.js';
import { Environment } from '../world/sky.js';
import { Colliders } from '../world/colliders.js';
import { Structures } from '../world/structures.js';
import { Props } from '../world/props.js';
import { Weather } from '../world/weather.js';
import { SPAWN, CAVERN, AREAS, CALDERA } from '../world/layout.js';
import { CharacterRenderer } from './characters.js';
import { Player } from './player.js';
import { Bots } from './bots.js';
import { Events, EVENT_DEFS, FROZEN_SITES } from './events.js';
import { Status } from './status.js';
import { QuestManager } from './quests.js';
import { computeStats, xpForLevel, TIER_XP, takeMinerals, inventoryCount } from './state.js';
import { rollPan, mineralValue, newUid } from './loot.js';
import { SITES, GROUND_COLORS } from '../data/sites.js';
import { MINERAL_BY_ID, TIERS, GEODES, MODIFIER_BY_ID } from '../data/minerals.js';
import { NPCS, OBJECTS } from '../data/npcs.js';
import { TOWNS } from '../data/places.js';
import { QUESTS } from '../data/quests.js';
import { CONSUMABLE_BY_ID, SLUICE_BY_ID, MAX_SLUICES, PAN_BY_ID, SHOVEL_BY_ID, PAN_ENCHANTS, SHOVEL_ENCHANTS, RING_BY_ID } from '../data/equipment.js';
import { HUD } from '../ui/hud.js';
import { UI } from '../ui/panels.js';
import { fmtMoney, fmtKg } from '../ui/format.js';

const BARRIER_MSG = {
  bridge_repaired: '🌊 The currents are too strong! Lightkeeper Lou knows how to rebuild the bridge.',
  cave_open: '🪨 A rockfall blocks the caverns. Engineer Edna at the Deposits can clear it.',
  infernal_access: '🔥 The Infernal Heart is sealed. The Flame Priest holds the key.',
};

export class Game {
  constructor({ renderer, backendName, gpuName, metal, quality, settings, saves, slot, save }) {
    this.renderer = renderer;
    this.backendName = backendName;
    this.backendLabel = backendName === 'WebGPU' ? (metal ? 'WebGPU · Metal' : 'WebGPU') : metal ? 'WebGL2 · Metal (ANGLE)' : 'WebGL2';
    this.gpuName = gpuName;
    this.metal = metal;
    this.quality = quality;
    this.settings = settings;
    this.saves = saves;
    this.slot = slot;
    this.save = save;
    this.clock = 0;
    this.fps = 60;
    this.statsTimer = 0;
    this.areaTimer = 0;
    this.saveTimer = 20;
    this.shakeAmt = 0;
    this.action = null;
    this.actionMode = null;
    this.contextHint = '';
    this.interactTarget = null;
    this.botTotems = [];
    this.sluiceObjs = [];
    this.totemObjs = [];
  }

  // ------------------------------------------------------------------
  async init(progress = () => {}) {
    const q = this.quality;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, q.viewDist * (this.settings.viewScale || 1));
    this.res = new ResolutionController(this.renderer, this.settings);
    this.renderer.setSize(innerWidth, innerHeight);
    window.addEventListener('resize', () => this.onResize());
    this.input = new Input(this.renderer.domElement);
    this.audio = new Audio(this.settings);

    // ---- world ----
    progress(0.02, 'Shaping the island…');
    this.world = new WorldData();
    const key = worldCacheKey();
    const cached = await loadWorldCache(key);
    if (cached && cached.heights?.length === this.world.heights.length) {
      this.world.importBuffers(cached);
      progress(0.45, 'Loaded island from cache');
    } else {
      await this.world.generate((p) => progress(0.02 + p * 0.3, 'Carving rivers & valleys…'));
      await this.world.computeColors((p) => progress(0.32 + p * 0.12, 'Painting sand & grass…'));
      saveWorldCache(key, this.world.exportBuffers());
    }
    this.world.flags = this.save.flags;

    progress(0.46, 'Building terrain…');
    const detail = makeDetailTexture();
    this.env = new Environment(this.scene, q);
    this.env.t = this.save.timeOfDay ?? 0.3;
    this.terrain = new Terrain(this.world, this.scene, detail);
    await this.terrain.build((p) => progress(0.46 + p * 0.16, 'Building terrain…'), q.shadows >= 2048);
    progress(0.63, 'Filling rivers…');
    this.water = new Water(this.world, this.scene, makeWaterNormalTexture(), detail, this.env.u);
    this.colliders = new Colliders();
    progress(0.68, 'Raising towns…');
    await tick();
    this.structures = new Structures(this.world, this.scene, this.colliders, this.env);
    this.structures.build();
    progress(0.76, 'Planting trees…');
    await tick();
    this.props = new Props(this.world, this.scene, this.colliders, q);
    this.props.build();
    progress(0.86, 'Waking up prospectors…');
    await tick();
    this.chars = new CharacterRenderer(this.scene);
    this.player = new Player(this);
    this.applyLook();
    this.chars.add(this.player.char);
    this.npcs = NPCS.map((def) => {
      const y = this.world.groundAt(def.x, def.z);
      const char = { x: def.x, y, z: def.z, yaw: def.yaw, look: def.look, tool: null, name: def.name, isNPC: true, anim: { state: def.sit ? 'sit' : 'idle', t: Math.random() * 5, phase: 0 } };
      this.chars.add(char);
      return { def, char, baseYaw: def.yaw };
    });
    this.vfx = new VFX(this.scene, q);
    for (const s of this.structures.smokeSources) this.vfx.addEmitter({ kind: 'smoke', x: s.x, y: s.y, z: s.z, rate: s.rate, range: 140 });
    if (this.structures.generatorSmoke) {
      const gs = this.structures.generatorSmoke;
      this.genEmitter = this.vfx.addEmitter({ kind: 'smoke', x: gs.x, y: gs.y, z: gs.z, rate: gs.rate, range: 140, enabled: !!this.save.flags.cave_open, opts: { color: '#555555', alpha: 0.5 } });
    }
    for (const c of this.structures.campfires || []) this.vfx.addEmitter({ kind: 'ember', x: c.x, y: c.y + 0.6, z: c.z, rate: 2, range: 60 });
    this.weather = new Weather(this.scene, q);
    this.status = new Status(this);
    this.events = new Events(this);
    this.quests = new QuestManager(this);
    this.hud = new HUD(this);
    this.chat = this.hud.chat;
    this.ui = new UI(this);
    const botCount = { low: 14, medium: 22, high: 28, ultra: 34 }[this.settings.quality] || 24;
    this.bots = new Bots(this, botCount);
    this.bots.init();
    progress(0.93, 'Drawing the map…');
    await tick();
    this.mapImage = this.buildMapImage();
    this.structures.setFlags(this.save.flags);
    this.structures.flagsRef = this.save.flags;
    // spawn
    const sp = this.save.pos;
    if (sp) this.player.spawn(sp[0], sp[1], this.save.yaw);
    else this.player.spawn(SPAWN.x, SPAWN.z, SPAWN.yaw);
    this.player.camPos.set(this.player.pos.x, this.player.pos.y + 6, this.player.pos.z + 10);
    this.terrain.prewarm(this.player.pos.x, this.player.pos.z);
    this.restorePlaceables();
    this.offlineProgress();
    this.quests.ensureBounties();
    this.recomputeStats();
    this.bindKeys();
    this.applySettings('all');
    progress(1, 'Ready!');
    // warm up shader compilation with one render
    this.terrain.update(this.player.pos, this.camera.far);
    this.player.updateCamera(0.016, this.camera, this.input);
    await this.renderer.compileAsync?.(this.scene, this.camera).catch(() => {});
    this.chat.system('Welcome to Prospect! Dig, pan, and strike it rich. ⛏️');
    if (!this.save.quests.done.q_start1) this.chat.system('Talk to John by the statue to get started (look for the ! marker).');
    if (this.save.playTime < 1) {
      this.ui.state.menuTab = 'help';
      setTimeout(() => this.ui.open('menu'), 400);
    }
    window.__game = this;
  }

  // Advance the simulation without rendering (used by automated tests / debugging).
  simulate(seconds, dt = 0.05) {
    this.skipRender = true;
    for (let t = 0; t < seconds; t += dt) this.frame(dt);
    this.skipRender = false;
  }

  start() {
    this.hud.show(true);
    let last = performance.now();
    let acc = 0;
    this.renderer.setAnimationLoop((now) => {
      now = now ?? performance.now();
      const raw = (now - last) / 1000;
      const cap = this.settings.fpsCap || 0;
      if (cap > 0 && raw < 1 / cap - 0.002) return;
      last = now;
      const dt = Math.min(0.05, raw);
      this.fps += (1 / Math.max(0.001, raw) - this.fps) * 0.05;
      this.res.update(raw * 1000, cap > 0 ? 1000 / cap : 1000 / 60);
      this.frame(dt);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.saveGame();
    });
    window.addEventListener('pagehide', () => this.saveGame());
  }

  onResize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.res.apply();
  }

  bindKeys() {
    this.input.on('key', (code) => {
      this.audio.unlock();
      const ui = this.ui;
      const map = { KeyI: 'inventory', KeyB: 'inventory', KeyJ: 'quests', KeyC: 'index', KeyM: 'map' };
      if (code === 'Escape') {
        if (ui.isOpen) ui.close();
        else ui.open('menu');
        return;
      }
      if (map[code]) {
        if (ui.current === map[code]) ui.close();
        else if (!ui.isOpen || ['inventory', 'quests', 'index', 'map'].includes(ui.current)) ui.open(map[code]);
      }
      if (code === 'KeyQ' && !ui.isOpen) this.quickPotion();
      if (code === 'Tab') this.hud.toggleLeaderboard();
    });
    this.renderer.domElement.addEventListener('pointerdown', () => this.audio.unlock());
  }

  // ------------------------------------------------------------------
  frame(dt) {
    this.clock += dt;
    const s = this.save;
    s.playTime += dt;
    const input = this.input;
    input.update();
    const look = input.consume();
    if (this.ui.isOpen) {
      look.jump = false;
      look.interact = false;
    }
    this.player.update(dt, input, look);

    // stats
    this.statsTimer -= dt;
    if (this.statsTimer <= 0) {
      this.statsTimer = 0.2;
      this.recomputeStats();
    }
    // timers on effects/totems
    for (const e of s.effects) e.left -= dt;
    if (s.effects.some((e) => e.left <= 0)) {
      for (const e of s.effects.filter((x) => x.left <= 0)) this.hud.toast(`🧪 ${CONSUMABLE_BY_ID[e.id]?.name} wore off`);
      s.effects = s.effects.filter((e) => e.left > 0);
    }
    this.updateTotems(dt);
    this.updateSluices(dt);

    // area / site tracking
    this.areaTimer -= dt;
    if (this.areaTimer <= 0) {
      this.areaTimer = 0.25;
      this.trackArea();
    }
    this.updateContext();
    this.updateAction(dt);
    this.updateInteract(look.interact);

    this.status.update(dt);
    this.events.update(dt);
    this.bots.update(dt);
    this.updateNPCs(dt);
    this.updateAtmosphere(dt);

    const cam = this.camera;
    this.env.update(dt, this.player.pos, cam, cam.far, this.settings.dayScale || 1);
    this.structures.update(dt, this.clock, this.env.u.stars.value);
    this.weather.update(dt, cam.position, this.player.pos.y);
    this.terrain.update(cam.position, cam.far);
    this.props.update(cam.position, Math.min(150, cam.far * 0.4), Math.min(cam.far + 40, this.quality.viewDist * 0.85 + 60));
    this.player.char.panFill = Math.max(0, (s.pan.fill - (this.action?.type === 'shake' ? this.action.progress : 0)) / Math.max(1, this.stats.capacity));
    this.chars.update(dt, cam.position, Math.min(150, cam.far));
    this.vfx.update(dt, this.player.pos);
    this.player.updateCamera(dt, cam, input);
    if (this.shakeAmt > 0) {
      cam.position.x += (Math.random() - 0.5) * this.shakeAmt;
      cam.position.y += (Math.random() - 0.5) * this.shakeAmt;
      this.shakeAmt = Math.max(0, this.shakeAmt - dt * 2.5);
    }
    this.updateAmbience(dt);
    // throttle shadow-map updates on lower presets (shadow pass = extra depth render)
    const se = this.quality.shadowEvery || 1;
    if (this.env.sun.castShadow) {
      this.env.sun.shadow.autoUpdate = se <= 1;
      if (se > 1 && (this._frameN = (this._frameN || 0) + 1) % se === 0) this.env.sun.shadow.needsUpdate = true;
    }
    if (!this.skipRender) this.renderer.render(this.scene, cam);
    this.hud.update(dt);

    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 20;
      this.saveGame();
    }
  }

  // ------------------------------------------------------------------
  recomputeStats() {
    const sm = this.status.statMods();
    const ev = this.events;
    const env = { ...sm.env, status: sm.status };
    env.luckMult = (env.luckMult || 1) * ev.globalLuckMult();
    if (ev.isActive('rain') && ['rubble', 'deposits', 'fortune', 'delta', 'wilds', 'sunset'].includes(this.currentArea?.id)) env.status = [...env.status, { mods: { shakeSpeed: 1.15 } }];
    this.stats = computeStats(this.save, env);
  }

  xpNeeded() {
    return xpForLevel(this.save.level);
  }

  addXP(n) {
    const s = this.save;
    s.xp += Math.round(n);
    while (s.xp >= this.xpNeeded()) {
      s.xp -= this.xpNeeded();
      s.level++;
      const bonus = s.level * 2;
      this.addShards(bonus);
      this.hud.floatText(`LEVEL ${s.level}!`, '#ffd23f', 40);
      this.hud.toast(`⭐ Level ${s.level}! +1% Luck, +0.5% Sell, +${bonus} shards`, 'quest');
      this.audio.play('levelup');
      const p = this.player.pos;
      this.vfx.burst('levelup', p.x, p.y + 0.2, p.z, { n: 30 });
    }
  }

  addMoney(n, pop = true) {
    n = Math.round(n);
    this.save.money += n;
    this.save.stats.earned += n;
    if (pop && n > 0) this.hud.moneyPop(n);
  }

  addShards(n) {
    this.save.shards += n;
    this.save.stats.shardsTotal += n;
    this.quests?.onShards(n);
  }

  consumable(id) {
    return CONSUMABLE_BY_ID[id];
  }

  npcName(id) {
    return NPCS.find((n) => n.id === id)?.name || id;
  }

  areaName(id) {
    return AREAS.find((a) => a.id === id)?.name;
  }

  hasQuestAttention() {
    return Object.keys(this.save.quests.active).some((q) => this.quests.isComplete(q)) || this.save.bounties.list.some((b) => b.done && !b.claimed);
  }

  groundColorHex(g) {
    const c = GROUND_COLORS[g] || [0.6, 0.5, 0.35];
    return new THREE.Color(c[0], c[1], c[2]).getHex();
  }

  // ------------------------------------------------------------------
  inCaveAt(x, z) {
    return Math.hypot(x - CAVERN.x, z - CAVERN.z) < CAVERN.r - 4;
  }

  get inCave() {
    const p = this.player.pos;
    return this.inCaveAt(p.x, p.z) && p.y < CAVERN.roof;
  }

  nearCampfire(x, z, r) {
    for (const c of this.structures.campfires || []) if (Math.hypot(x - c.x, z - c.z) < r) return true;
    return false;
  }

  isVisibleToPlayer(c) {
    const cam = this.camera;
    const dx = c.x - cam.position.x,
      dz = c.z - cam.position.z;
    if (Math.hypot(dx, dz) > 90) return false;
    const fx = -Math.sin(this.player.camYaw),
      fz = -Math.cos(this.player.camYaw);
    return dx * fx + dz * fz > 0;
  }

  shake(a) {
    this.shakeAmt = Math.max(this.shakeAmt, a);
  }

  checkBarrier(x, z) {
    const flags = this.save.flags;
    for (const a of AREAS) {
      if (!a.flag || flags[a.flag]) continue;
      const d = Math.hypot(x - a.x, z - a.z);
      if (d < a.r) {
        const now = this.clock;
        if (!this._barrierMsgT || now - this._barrierMsgT > 4) {
          this._barrierMsgT = now;
          this.hud.toast(BARRIER_MSG[a.flag] || 'You can’t go there yet.', 'bad');
          this.audio.play('error');
        }
        const p = this.player.pos;
        let px = p.x - a.x,
          pz = p.z - a.z;
        const len = Math.hypot(px, pz) || 1;
        return { px: px / len, pz: pz / len };
      }
    }
    return null;
  }

  setFlag(f, v) {
    this.save.flags[f] = v;
    this.world.flags = this.save.flags;
    this.structures.setFlags(this.save.flags);
    if (f === 'cave_open' && this.genEmitter) this.genEmitter.enabled = v;
    if (v) {
      const p = this.player.pos;
      this.vfx.burst('confetti', p.x, p.y + 2, p.z, { n: 60, ground: p.y });
      if (f === 'cave_open') this.chat.system('💥 BOOM! The rockfall at the Crystal Caverns has been cleared!');
      if (f === 'bridge_repaired') this.chat.system('🌉 The bridge to Caldera Island has been rebuilt! The lighthouse shines again.');
      if (f === 'infernal_access') this.chat.system('🔥 The path to the Infernal Heart is open!');
    }
  }

  // ------------------------------------------------------------------
  trackArea() {
    const p = this.player.pos;
    const w = this.world;
    const area = w.areaAt(p.x, p.z);
    const site = this.siteAt(p.x, p.z);
    const siteName = site ? `${SITES[site].name} • Toughness ${SITES[site].toughness}` : '';
    if (area.id !== this.currentArea?.id || siteName !== this.currentSiteName) {
      const changedArea = area.id !== this.currentArea?.id;
      this.currentArea = area;
      this.currentSiteName = siteName;
      if (changedArea || siteName) this.hud.showArea(area);
      if (!this.save.discovered.areas[area.id]) {
        this.save.discovered.areas[area.id] = true;
        if (area.id !== 'wilds' && area.id !== 'ocean') this.addXP(50);
      }
    }
    if (site) this.lastSite = site;
    for (const t of TOWNS) {
      if (this.save.discovered.towns[t.id]) continue;
      if (Math.hypot(p.x - t.x, p.z - t.z) < 45) {
        this.save.discovered.towns[t.id] = true;
        this.hud.toast(`🧭 Discovered ${t.name}! Fast travel unlocked.`, 'good');
        this.audio.play('quest');
        this.addXP(150);
      }
    }
  }

  siteAt(x, z) {
    return this.events.dynamicSiteAt(x, z) || this.world.siteAt(x, z);
  }

  get currentSite() {
    const p = this.player.pos;
    return this.siteAt(p.x, p.z);
  }

  perfectZone() {
    const c = 0.79;
    const w = Math.min(0.5, 0.14 * (this.stats.perfectZone || 1));
    return [Math.max(0.2, c - w / 2), Math.min(0.99, c + w / 2)];
  }

  updateContext() {
    const p = this.player;
    const s = this.save;
    const st = this.stats;
    let mode = null,
      hint = '',
      bad = false;
    const site = this.currentSite;
    if (p.inWater && s.pan.fill > 0.01) {
      mode = 'shake';
      hint = this.input.touch ? 'Hold PAN to shake your pan!' : 'Hold click to shake your pan!';
    } else if (site && !p.swimming && p.waterDepth < 0.7) {
      const t = SITES[site].toughness;
      if (t > st.toughness) {
        hint = `🪨 Too hard! ${SITES[site].name} needs Toughness ${t} (yours: ${st.toughness})`;
        bad = true;
        mode = 'hard';
      } else if (site === 'infernal_heart' && !this.events.infernalAwake) {
        hint = `🔥 The Heart is dormant. It awakens in ${Math.ceil(this.events.infernalRemaining)}s`;
        bad = true;
        mode = 'hard';
      } else if (s.pan.fill >= st.capacity - 0.01) {
        hint = '🍳 Pan full! Walk into water and shake it.';
        mode = 'full';
      } else {
        mode = 'dig';
        hint = this.input.touch ? 'Hold DIG, release in the green!' : 'Hold click to dig, release in the green!';
      }
    } else if (p.inWater && s.pan.fill <= 0.01) {
      hint = 'Your pan is empty. Dig at a dig site first!';
    } else if (s.pan.fill >= st.capacity - 0.01) {
      hint = '🍳 Pan full! Find water to pan it.';
    }
    this.actionMode = mode;
    this.contextHint = hint;
    this.contextBad = bad;
    // held tool visual
    if (!this.action) p.char.tool = p.inWater && s.pan.fill > 0.01 ? 'pan' : mode === 'dig' || mode === 'hard' ? 'shovel' : s.pan.fill > 0.01 ? 'pan' : 'shovel';
    const pan = PAN_BY_ID[s.gear.pan];
    p.char.panColor = pan.color;
    p.char.shovelColor = SHOVEL_BY_ID[s.gear.shovel].color;
    const dom = Object.entries(s.pan.sites).sort((a, b) => b[1] - a[1])[0];
    if (dom) p.char.dirtColor = this.groundColorHex(SITES[dom[0].split('|')[0]]?.ground);
  }

  updateAction(dt) {
    const held = this.input.actionHeld && !this.ui.isOpen;
    const p = this.player;
    const a = this.action;
    const st = this.stats;
    if (a?.type === 'dig') {
      if (a.charging) {
        const ct = 1.0 / Math.max(0.2, st.digSpeed);
        a.v += (a.dir * dt) / ct;
        if (a.v >= 1) {
          a.v = 1;
          a.dir = -1;
        } else if (a.v <= 0) {
          a.v = 0;
          a.dir = 1;
        }
        p.char.anim.actionT = 0.3 * a.v;
        p.actionAnim = 'dig';
        if (!held || this.actionMode !== 'dig') {
          a.charging = false;
          a.t = 0.2;
          a.release = a.v;
        }
      } else {
        a.t += dt / 0.5;
        p.char.anim.actionT = Math.min(1, a.t);
        if (a.t >= 0.5 && !a.applied) {
          a.applied = true;
          this.performDig(a.release);
        }
        if (a.t >= 1) {
          this.action = null;
          p.actionAnim = null;
        }
      }
      return;
    }
    if (a?.type === 'shake') {
      if (!held || this.actionMode !== 'shake' || this.save.pan.fill <= 0) {
        this.save.pan.progress = a.progress;
        this.action = null;
        p.actionAnim = null;
        p.char.anim.shaking = false;
        return;
      }
      p.actionAnim = 'shake';
      p.char.anim.shaking = true;
      a.timer -= dt;
      if (a.timer <= 0) {
        a.timer = 0.48 / Math.max(0.2, st.shakeSpeed);
        a.progress += st.shakeStrength * 2;
        const fx = p.pos.x + Math.sin(p.yaw) * 0.7,
          fz = p.pos.z + Math.cos(p.yaw) * 0.7;
        const wl = this.world.waterAt(fx, fz);
        this.vfx.burst('splash', fx, wl > -900 ? wl : p.pos.y + 0.5, fz, { n: 7 });
        this.audio.play('shake');
        if (a.progress >= a.total) {
          this.action = null;
          p.actionAnim = null;
          p.char.anim.shaking = false;
          this.needRelease = true;
          this.completePan();
        }
      }
      return;
    }
    if (!held) {
      this.needRelease = false;
      return;
    }
    if (this.needRelease) return;
    if (this.actionMode === 'dig') {
      this.action = { type: 'dig', charging: true, v: 0, dir: 1, t: 0 };
      p.char.tool = 'shovel';
      p.char.anim.state = 'dig';
      p.char.anim.t = 0;
    } else if (this.actionMode === 'shake') {
      p.char.tool = 'pan';
      const fill = this.save.pan.fill;
      this.action = { type: 'shake', progress: this.save.pan.progress || 0, total: fill, timer: 0.1 };
    } else if (this.actionMode === 'hard' && !this._hardT) {
      this._hardT = 0.6;
      this.audio.play('digHard');
      this.hud.floatText(this.contextHint.includes('dormant') ? 'DORMANT!' : 'TOO HARD!', '#ff6b7a', 26);
      setTimeout(() => (this._hardT = 0), 700);
    }
  }

  performDig(v) {
    const s = this.save;
    const st = this.stats;
    const p = this.player;
    const site = this.currentSite;
    if (!site) return;
    const [z0, z1] = this.perfectZone();
    const perfect = v >= z0 && v <= z1;
    const power = perfect ? 1.3 : 0.25 + 0.6 * v;
    const room = st.capacity - s.pan.fill;
    const amount = Math.min(room, st.digStrength * power);
    if (amount <= 0) return;
    const ctx = this.events.digContext(site, p.pos.x, p.pos.z);
    const key = ctx.inFlare ? site + '|flare' : site;
    s.pan.sites[key] = (s.pan.sites[key] || 0) + amount;
    s.pan.fill += amount;
    s.pan.digs++;
    if (perfect) s.pan.perfect++;
    s.stats.digs++;
    this.quests.onDig(site);
    this.status.onPerfect(perfect);
    // effects
    const fx = p.pos.x + Math.sin(p.yaw) * 1.0,
      fz = p.pos.z + Math.cos(p.yaw) * 1.0;
    const gy = this.world.heightAt(fx, fz);
    this.vfx.burst('dirt', fx, gy, fz, { n: perfect ? 18 : 10, color: this.groundColorHex(SITES[site].ground) });
    this.audio.play('dig');
    if (perfect) {
      s.stats.perfect++;
      this.quests.onPerfect();
      this.audio.play('perfect');
      this.hud.floatText('PERFECT!', '#5fe36a', 30);
      this.vfx.burst('sparkle', fx, gy + 0.5, fz, { n: 8, color: '#9dff9d' });
    }
    // meteor shards
    const shardChance = 0.012 * st.shardMult * ctx.shardMult * (site === 'meteor_crater' ? 6 : 1);
    if (Math.random() < shardChance) {
      const n = 1 + Math.floor(Math.random() * 3);
      this.addShards(n);
      this.hud.toast(`◆ Found ${n} Meteor Shard${n > 1 ? 's' : ''}!`, 'good');
      this.audio.play('shard');
      this.vfx.burst('shards', fx, gy, fz, { n: 8 });
    }
    // geodes
    const geode = SITES[site].geode;
    if (geode && Math.random() < 0.0035 * ctx.geodeMult) {
      s.items.geodes[geode] = (s.items.geodes[geode] || 0) + 1;
      this.hud.toast(`🪨 You dug up a ${GEODES[geode].name}! Open it from your backpack.`, 'good');
      this.audio.play('geode');
    }
    if (s.pan.fill >= st.capacity - 0.01) {
      this.hud.toast('🍳 Your pan is full! Head to the water.');
    }
  }

  completePan() {
    const s = this.save;
    const st = this.stats;
    const pan = s.pan;
    const fill = pan.fill;
    const perfectRatio = pan.digs ? pan.perfect / pan.digs : 0;
    const total = Math.max(1, Math.round(Math.pow(fill, 0.62) * (0.85 + Math.random() * 0.3)));
    const keys = Object.entries(pan.sites).filter(([, a]) => a > 0);
    const items = [];
    // distribute count across site keys
    let remaining = total;
    keys.forEach(([k, amt], i) => {
      let n = i === keys.length - 1 ? remaining : Math.round((total * amt) / fill);
      n = Math.max(0, Math.min(remaining, n));
      remaining -= n;
      if (!n) return;
      const [siteId, flag] = k.split('|');
      if (!SITES[siteId]) return;
      const ev = this.events.digContext(siteId, flag === 'flare' ? this.events.flares[0]?.x ?? 1e9 : 1e9, 0);
      const ctx = {
        sites: { [siteId]: amt },
        fill,
        count: n,
        luck: st.luck * (1 + 0.15 * perfectRatio) * ev.luckMult / this.events.globalLuckMult(),
        sizeBoost: st.sizeBoost,
        modifierBoost: st.modifierBoost,
        modMults: { ...ev.mods },
        cold: ev.cold,
        tierMult: ev.tierMult || (ev.auroraBoost ? { 5: 2 } : null),
        siteSize: { [siteId]: ev.siteSize * (flag === 'flare' ? 2 : 1) },
      };
      if (flag === 'flare') {
        ctx.modMults.electrified = (ctx.modMults.electrified || 1) * 6;
        ctx.modMults.glowing = (ctx.modMults.glowing || 1) * 3;
      }
      if (st.scorchMult > 1) ctx.modMults.scorching = (ctx.modMults.scorching || 1) * st.scorchMult;
      items.push(...rollPan(ctx));
    });
    pan.fill = 0;
    pan.sites = {};
    pan.perfect = 0;
    pan.digs = 0;
    pan.progress = 0;
    s.stats.pans++;
    this.quests.onPan();
    this.receiveItems(items, 'pan');
  }

  receiveItems(items, source) {
    const s = this.save;
    const p = this.player.pos;
    const sm = this.stats.sellMult;
    let best = null;
    let autoSold = 0,
      autoN = 0;
    items.sort((a, b) => mineralValue(b) - mineralValue(a));
    let shown = 0;
    for (const it of items) {
      const m = MINERAL_BY_ID[it.id];
      it.huge = it.kg > m.kg * 3.2;
      const value = mineralValue(it, sm);
      const disc = (s.discovered.minerals[it.id] ||= { n: 0, best: 0 });
      const isNew = disc.n === 0;
      disc.n++;
      disc.best = Math.max(disc.best, it.kg);
      s.stats.found++;
      if (m.tier === 4) s.stats.legendaries++;
      if (m.tier === 5) s.stats.mythics++;
      if (m.tier === 6) s.stats.exotics++;
      if (!s.stats.best || value > s.stats.best.value) s.stats.best = { id: it.id, kg: it.kg, value };
      this.addXP(TIER_XP[m.tier] * (1 + (it.mods?.length || 0) * 0.5));
      this.quests.onFind(it, this.currentArea?.id);
      if (isNew) this.hud.toast(`📖 New discovery: ${m.name}!`, 'good');
      if (this.settings.autoSellCommon && m.tier === 0 && !it.mods?.length && !isNew) {
        autoSold += value;
        autoN++;
        continue;
      }
      s.inv.push(it);
      if (shown < 5 || m.tier >= 2) {
        this.hud.findCard(it, value);
        shown++;
      }
      if (!best || m.tier > MINERAL_BY_ID[best.id].tier || (m.tier === MINERAL_BY_ID[best.id].tier && value > mineralValue(best))) best = it;
    }
    if (autoSold) {
      this.addMoney(autoSold);
      s.stats.sold += autoN;
      this.quests.onSell(autoN, autoSold);
    }
    if (items.length > 5 && shown >= 5) this.hud.toast(`+${items.length} minerals found!`);
    if (!best && !items.length) return;
    const bt = best ? MINERAL_BY_ID[best.id].tier : 0;
    this.audio.play('find', { tier: bt });
    this.vfx.burst('sparkle', p.x + Math.sin(this.player.yaw) * 0.7, p.y + 1.2, p.z + Math.cos(this.player.yaw) * 0.7, { n: 10 + bt * 6, color: TIERS[bt].glow });
    if (best && bt >= 3) {
      this.vfx.beam(p.x, p.y, p.z, TIERS[bt].glow, 3 + bt * 0.5, bt >= 5 ? 1.6 : 1);
    }
    if (best && bt >= 4) {
      const value = mineralValue(best, sm);
      this.hud.bigFind(best, value);
      this.vfx.burst('confetti', p.x, p.y + 2, p.z, { n: 50 + bt * 20, ground: p.y });
      this.shake(0.25);
      const mods = (best.mods || []).map((x) => MODIFIER_BY_ID[x].name + ' ').join('');
      this.chat.global(`${this.save.name} found a ${TIERS[bt].name} ${mods}${MINERAL_BY_ID[best.id].name} (${fmtKg(best.kg)})!`, TIERS[bt].color);
      this.bots.reactToPlayer(bt);
    }
    if (s.inv.length > 1500) {
      // safety valve for save size: auto-sell the cheapest unlocked commons
      const extra = s.inv.filter((x) => !x.locked && MINERAL_BY_ID[x.id].tier === 0).sort((a, b) => a.kg - b.kg).slice(0, s.inv.length - 1400);
      if (extra.length) {
        this.sellItems(extra, true);
        this.hud.toast('🎒 Backpack overflowing: auto-sold cheap commons.');
      }
    }
  }

  sellItems(list, silent) {
    if (!list.length) return;
    const sm = this.stats.sellMult;
    let total = 0;
    const set = new Set();
    for (const it of list) {
      total += mineralValue(it, sm);
      set.add(it.uid);
    }
    this.save.inv = this.save.inv.filter((x) => !set.has(x.uid));
    this.addMoney(total);
    this.save.stats.sold += list.length;
    this.quests.onSell(list.length, total);
    if (!silent) {
      this.audio.play('coin', { n: Math.min(6, list.length) });
      this.hud.toast(`💰 Sold ${list.length} mineral${list.length > 1 ? 's' : ''} for ${fmtMoney(total)}`, 'good');
    }
  }

  // ------------------------------------------------------------------
  updateInteract(pressed) {
    const p = this.player.pos;
    let best = null,
      bd = 1e9;
    const consider = (x, z, r, label, fn) => {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < r && d < bd) {
        bd = d;
        best = { label, fn };
      }
    };
    for (const n of this.npcs) {
      const def = n.def;
      const q = this.quests.npcQuest(def);
      let label = `Talk to ${def.name}`;
      if (def.role === 'merchant' && !(q && q.st !== 'active')) label = `Sell to ${def.name}`;
      if (def.role === 'shop') label = `Shop at ${def.title}`;
      consider(n.char.x, n.char.z, 3.6, label, () => this.talkTo(n));
    }
    for (const o of OBJECTS) consider(o.x, o.z, o.radius, o.role === 'altar' ? 'Use the Mysterious Altar' : o.role === 'board' ? 'Read the Notice Board' : 'View museum displays', () => this.ui.open(o.role));
    for (const t of this.structures.travelPosts) consider(t.x, t.z, 3.2, 'Fast travel', () => this.ui.open('map', true));
    this.save.sluices.forEach((sl, i) => consider(sl.x, sl.z, 3.5, `Collect sluice (${sl.stored.length})`, () => this.collectSluice(i)));
    this.interactTarget = best;
    if (pressed && best && !this.ui.isOpen) best.fn();
  }

  interact() {
    if (this.interactTarget && !this.ui.isOpen) this.interactTarget.fn();
  }

  talkTo(n) {
    const def = n.def;
    const q = this.quests.npcQuest(def);
    const hasQuest = q && (q.st === 'available' || q.st === 'ready');
    n.talkT = 4;
    if (hasQuest || def.role === 'quest') return this.ui.open('npc', def);
    switch (def.role) {
      case 'shop':
        return this.ui.open('shop', def.shop);
      case 'merchant':
        return this.ui.open('merchant', def);
      case 'museum':
        return this.ui.open('npc', def);
      case 'anvil':
        return this.ui.open('anvil', def);
      case 'shards':
        return this.ui.open('shards', def);
      case 'supplies':
        return this.ui.open('supplies', def);
      case 'sluice':
        return this.ui.open('sluice', def);
      default:
        return this.ui.open('npc', def);
    }
  }

  updateNPCs(dt) {
    const p = this.player.pos;
    for (const n of this.npcs) {
      const c = n.char;
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      let target = n.baseYaw;
      if (d < 7 && !n.def.sit) target = Math.atan2(p.x - c.x, p.z - c.z);
      let dy = target - c.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      c.yaw += dy * Math.min(1, dt * 4);
      if (!n.def.sit) {
        n.talkT = (n.talkT || 0) - dt;
        c.anim.state = n.talkT > 0 && n.talkT < 3.5 ? 'wave' : 'idle';
        if (d < 12 && n.greeted !== true && this.quests.npcQuest(n.def)?.st === 'available') {
          n.greeted = true;
          this.hud.bubble(c, n.def.greet[0]);
        }
      }
    }
  }

  // ------------------------------------------------------------------
  updateAtmosphere(dt) {
    const area = this.currentArea?.id;
    const ev = this.events;
    const W = this.weather;
    const p = this.player.pos;
    let atm = null;
    const local = (id, regions) => ev.isActive(id) && EVENT_DEFS[id].regions.includes(area);
    if (this.inCave) atm = 'cave';
    else if (local('sandstorm')) atm = 'sandstorm';
    else if (local('blizzard')) atm = 'blizzard';
    else if (local('eruption')) atm = 'eruption';
    else if (local('rain')) atm = 'rain';
    else if (ev.rift && Math.hypot(p.x - ev.rift.x, p.z - ev.rift.z) < 70) atm = 'rift';
    else if (['caldera', 'furnace', 'infernal'].includes(area)) atm = 'volcano';
    this.env.setAtmosphere(atm);
    const night = this.env.isNight;
    const cold = ['frostbite', 'peak'].includes(area) || (area === 'mountains' && p.y > 80);
    W.set('rain', local('rain') && !this.inCave ? 1 : 0);
    W.set('sand', local('sandstorm') ? 1 : 0);
    W.set('snow', local('blizzard') ? 1 : cold && !this.inCave ? 0.25 : 0);
    W.set('ash', local('eruption') ? 0.8 : 0);
    W.set('embers', ['caldera', 'furnace', 'infernal'].includes(area) ? (local('eruption') ? 1 : 0.35) : 0);
    W.set('fireflies', night && ['rubble', 'deposits', 'fortune', 'delta', 'wilds', 'oasis'].includes(area) && !local('rain') ? 0.6 : 0);
    W.set('sparkles', ev.isActive('lucky_breeze') ? 0.6 : this.inCave ? 0.35 : 0);
    W.set('void', ev.rift && Math.hypot(p.x - ev.rift.x, p.z - ev.rift.z) < 80 ? 0.8 : 0);
    W.auroraTarget = ev.isActive('aurora') && night ? 1 : 0;
    this.water.uniforms.rapids.value += ((ev.isActive('river_rapids') ? 3 : 1) - this.water.uniforms.rapids.value) * Math.min(1, dt);
  }

  updateAmbience(dt) {
    this.ambT = (this.ambT || 0) - dt;
    if (this.ambT > 0 || !this.audio.ctx) return;
    this.ambT = 0.5;
    const p = this.player.pos;
    const w = this.world;
    let water = 0;
    for (const [dx, dz] of [
      [0, 0],
      [12, 0],
      [-12, 0],
      [0, 12],
      [0, -12],
      [25, 25],
      [-25, -25],
    ]) {
      const wt = w.waterTypeAt(p.x + dx, p.z + dz);
      if (wt === 2 || wt === 3 || wt === 5) water += 0.18;
      if (wt === 1) water += 0.1;
    }
    const area = this.currentArea?.id;
    const ev = this.events;
    const falls = Math.max(0, 1 - Math.hypot(p.x - 30, p.z + 450) / 80);
    const lava = Math.max(0, 1 - Math.hypot(p.x - CALDERA.x, p.z - CALDERA.z) / 200);
    this.audio.setAmbience({
      water: Math.min(0.5, water),
      wind: Math.min(0.45, 0.05 + Math.max(0, p.y - 20) / 200 + (ev.isActive('sandstorm') || ev.isActive('blizzard') ? 0.3 : 0)),
      rain: this.weather.layers.rain.value * 0.4,
      lava: lava * 0.5,
      fall: falls * 0.6,
    });
    this.audio.updateMusic(0.5, this.env.isNight);
  }

  // ------------------------------------------------------------------
  // Consumables, totems, sluices, geodes
  useConsumable(id) {
    const s = this.save;
    const c = CONSUMABLE_BY_ID[id];
    if (!c || !(s.items.consumables[id] > 0)) return;
    if (c.kind === 'totem') {
      const p = this.player.pos;
      this.placeTotem(id, p.x + Math.sin(this.player.yaw) * 2, p.z + Math.cos(this.player.yaw) * 2, null, c.dur);
    } else {
      const e = s.effects.find((x) => x.id === id);
      if (e) e.left += c.dur;
      else s.effects.push({ id, left: c.dur });
      this.hud.toast(`🧪 ${c.name} active! ${c.desc}`, 'good');
      this.vfx.burst('sparkle', this.player.pos.x, this.player.pos.y + 1, this.player.pos.z, { n: 20, color: c.color });
    }
    s.items.consumables[id]--;
    this.audio.play('enchant');
    this.recomputeStats();
  }

  quickPotion() {
    const s = this.save;
    const order = ['greater_luck', 'basic_luck', 'merchants_potion', 'greater_capacity', 'speed_potion'];
    const id = order.find((x) => s.items.consumables[x] > 0 && !s.effects.find((e) => e.id === x));
    if (id) this.useConsumable(id);
    else this.hud.toast('No potions to drink (buy some from Rosie or Stella).');
  }

  placeTotem(id, x, z, owner, dur) {
    const c = CONSUMABLE_BY_ID[id];
    const y = this.world.groundAt(x, z);
    const t = { id, x, z, y, radius: c.radius, left: dur, owner };
    if (owner) this.botTotems.push(t);
    else {
      this.save.totems.push(t);
      this.hud.toast(`🗿 ${c.name} placed! ${c.desc}`, 'good');
    }
    this.makeTotemObj(t, c.color);
  }

  makeTotemObj(t, color) {
    const grp = new THREE.Group();
    const mat = new THREE.MeshLambertNodeMaterial({ color: 0x6b4423 });
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 0.7), mat);
    pole.position.y = 1.3;
    grp.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 1.1), new THREE.MeshLambertNodeMaterial({ color }));
    head.position.y = 2.9;
    grp.add(head);
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), new THREE.MeshBasicNodeMaterial({ color }));
    gem.position.y = 3.9;
    grp.add(gem);
    const ring = new THREE.Mesh(new THREE.RingGeometry(t.radius - 0.4, t.radius, 64), new THREE.MeshBasicNodeMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.3;
    grp.add(ring);
    grp.position.set(t.x, t.y, t.z);
    this.scene.add(grp);
    t.obj = grp;
    t.gem = gem;
    this.colliders.addCircle(t.x, t.z, 0.5, t.y - 1, t.y + 3).totem = t;
    t.collider = this.colliders.all[this.colliders.all.length - 1];
  }

  allTotems() {
    return this.save.totems.concat(this.botTotems);
  }

  updateTotems(dt) {
    const upd = (list) =>
      list.filter((t) => {
        t.left -= dt;
        if (t.gem) {
          t.gem.rotation.y += dt * 2;
          t.gem.position.y = 3.9 + Math.sin(this.clock * 2) * 0.2;
        }
        if (t.left <= 0) {
          if (t.obj) this.scene.remove(t.obj);
          if (t.collider) t.collider.enabled = false;
          return false;
        }
        return true;
      });
    this.save.totems = upd(this.save.totems);
    this.botTotems = upd(this.botTotems);
  }

  placeSluice(type) {
    const s = this.save;
    const p = this.player;
    if (s.sluices.length >= MAX_SLUICES) {
      this.hud.toast(`You can only place ${MAX_SLUICES} sluices. Collect one first.`, 'bad');
      return false;
    }
    if (!p.inWater || p.waterDepth > 1.6 || this.world.waterTypeAt(p.pos.x, p.pos.z) === 4) {
      this.hud.toast('Stand in shallow water to place a sluice.', 'bad');
      return false;
    }
    // nearest dig site within 140m
    const sd = this.world.siteShapeDist(p.pos.x, p.pos.z);
    const site = sd.edge < 140 ? sd.id : 'rubble_sands';
    if (SITES[site].toughness > this.stats.toughness + 1) {
      this.hud.toast('The sediment here is too tough for a sluice. Upgrade your shovel first.', 'bad');
      return false;
    }
    s.items.sluices[type]--;
    const sl = { type, x: p.pos.x, z: p.pos.z, y: this.world.waterAt(p.pos.x, p.pos.z), yaw: p.yaw, site, stored: [], acc: 0 };
    s.sluices.push(sl);
    this.makeSluiceObj(sl);
    this.hud.toast(`🪵 Sluice placed! It will collect from ${SITES[site].name}.`, 'good');
    this.audio.play('splash');
    return true;
  }

  makeSluiceObj(sl) {
    const def = SLUICE_BY_ID[sl.type];
    const grp = new THREE.Group();
    const wood = new THREE.MeshLambertNodeMaterial({ color: def.color });
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.25, 4), wood);
    base.position.y = 0.35;
    base.rotation.x = 0.12;
    grp.add(base);
    for (const sx of [-0.7, 0.7]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 4), wood);
      side.position.set(sx, 0.55, 0);
      side.rotation.x = 0.12;
      grp.add(side);
    }
    for (let i = 0; i < 5; i++) {
      const riffle = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.12, 0.1), new THREE.MeshLambertNodeMaterial({ color: 0x444444 }));
      riffle.position.set(0, 0.55 - i * 0.1 + 0.2, -1.6 + i * 0.8);
      grp.add(riffle);
    }
    const water = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 3.9), new THREE.MeshBasicNodeMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.6 }));
    water.position.y = 0.52;
    water.rotation.x = 0.12;
    grp.add(water);
    grp.position.set(sl.x, sl.y - 0.3, sl.z);
    grp.rotation.y = sl.yaw;
    this.scene.add(grp);
    this.sluiceObjs.push({ sl, grp });
  }

  updateSluices(dt) {
    const s = this.save;
    const p = this.player.pos;
    for (const sl of s.sluices) {
      const def = SLUICE_BY_ID[sl.type];
      sl.acc += dt;
      while (sl.acc >= def.interval) {
        sl.acc -= def.interval;
        this.sluiceRoll(sl);
      }
      if (Math.random() < dt * 3 && Math.hypot(p.x - sl.x, p.z - sl.z) < 50) this.vfx.burst('splash', sl.x + (Math.random() - 0.5), sl.y + 0.3, sl.z + (Math.random() - 0.5), { n: 2 });
    }
  }

  sluiceRoll(sl) {
    const def = SLUICE_BY_ID[sl.type];
    if (sl.stored.length >= def.capacity) return;
    const museumLuck = 1 + (this.stats?.breakdown?.museum?.luck || 0);
    const items = rollPan({ sites: { [sl.site]: 1 }, fill: 4, count: 1, luck: def.luck * museumLuck, sizeBoost: 0 });
    sl.stored.push(...items);
  }

  collectSluice(i) {
    const s = this.save;
    const sl = s.sluices[i];
    if (!sl) return;
    if (!sl.stored.length) {
      // pick it up
      s.items.sluices[sl.type] = (s.items.sluices[sl.type] || 0) + 1;
      s.sluices.splice(i, 1);
      const o = this.sluiceObjs.find((x) => x.sl === sl);
      if (o) {
        this.scene.remove(o.grp);
        this.sluiceObjs.splice(this.sluiceObjs.indexOf(o), 1);
      }
      this.hud.toast('🪵 Sluice picked up (it was empty).');
      return;
    }
    const items = sl.stored;
    sl.stored = [];
    this.hud.toast(`🪵 Collected ${items.length} minerals from your sluice!`, 'good');
    this.receiveItems(items, 'sluice');
  }

  restorePlaceables() {
    for (const sl of this.save.sluices) this.makeSluiceObj(sl);
    for (const t of this.save.totems) this.makeTotemObj(t, CONSUMABLE_BY_ID[t.id]?.color || '#fff');
  }

  offlineProgress() {
    const s = this.save;
    const away = Math.min(8 * 3600, Math.max(0, (Date.now() - (s.updated || Date.now())) / 1000));
    if (away < 60 || !s.sluices.length) return;
    let n = 0;
    for (const sl of s.sluices) {
      const def = SLUICE_BY_ID[sl.type];
      const rolls = Math.min(def.capacity - sl.stored.length, Math.floor(away / def.interval));
      for (let i = 0; i < rolls; i++) this.sluiceRoll(sl);
      n += rolls;
    }
    if (n) setTimeout(() => this.hud.toast(`🪵 While you were away, your sluices caught ${n} minerals!`, 'good', 6), 1500);
  }

  openGeode(id) {
    const s = this.save;
    const gd = GEODES[id];
    if (!(s.items.geodes[id] > 0)) return;
    s.items.geodes[id]--;
    const n = gd.rolls[0] + Math.floor(Math.random() * (gd.rolls[1] - gd.rolls[0] + 1));
    const items = rollPan({ sites: { [gd.site]: 1 }, fill: 10, count: n, luck: this.stats.luck * gd.luck, sizeBoost: this.stats.sizeBoost, modifierBoost: this.stats.modifierBoost });
    s.stats.geodes++;
    this.quests.onGeode();
    this.audio.play('geode');
    this.receiveItems(items, 'geode');
  }

  craftRing(id) {
    const s = this.save;
    const r = RING_BY_ID[id];
    if (!r || s.money < r.cost) return this.audio.play('error');
    if (!r.ingredients.every(([mid, n]) => inventoryCount(s, mid) >= n)) return this.audio.play('error');
    for (const [mid, n] of r.ingredients) takeMinerals(s, (it) => it.id === mid, n);
    s.money -= r.cost;
    s.rings.owned[id] = (s.rings.owned[id] || 0) + 1;
    if (s.rings.equipped.length < s.rings.slots) s.rings.equipped.push(id);
    this.quests.onCraft();
    this.audio.play('buy');
    this.hud.floatText(`${r.name.toUpperCase()}!`, '#ffd23f');
    this.hud.toast(`💍 Crafted ${r.name}${s.rings.equipped.includes(id) ? ' and equipped it' : ''}!`, 'good');
    this.onGearChanged();
  }

  enchant(target, mat) {
    const s = this.save;
    const gearId = target === 'pan' ? s.gear.pan : s.gear.shovel;
    if (!takeMinerals(s, (it) => it.id === mat, 1)) {
      this.audio.play('error');
      return null;
    }
    const pool = (target === 'pan' ? PAN_ENCHANTS : SHOVEL_ENCHANTS).filter((e) => e.pool === mat);
    const tw = pool.reduce((a, e) => a + e.weight, 0);
    let r = Math.random() * tw;
    let pick = pool[0];
    for (const e of pool) {
      r -= e.weight;
      if (r <= 0) {
        pick = e;
        break;
      }
    }
    s.gear.enchants[gearId] = pick.id;
    this.audio.play('enchant');
    const a = this.structures.altarPos;
    if (a) {
      this.vfx.burst('sparkle', a.x, a.y, a.z, { n: 50, color: pick.color });
      this.vfx.beam(a.x, a.y - 3, a.z, pick.color, 3, 1);
    }
    this.onGearChanged();
    return pick;
  }

  displayInMuseum(uid, silent) {
    const s = this.save;
    const idx = s.inv.findIndex((x) => x.uid === uid);
    if (idx < 0) return;
    const it = s.inv[idx];
    s.inv.splice(idx, 1);
    const old = s.museum[it.id];
    if (old) s.inv.push({ uid: newUid(), id: old.id, kg: old.kg, mods: old.mods || [], t: Date.now(), site: 'museum' });
    s.museum[it.id] = { id: it.id, kg: it.kg, mods: it.mods || [] };
    if (!silent) {
      this.audio.play('quest');
      this.hud.toast(`🏛️ ${MINERAL_BY_ID[it.id].name} is now on display!`, 'good');
    }
    this.quests.refreshPassive();
    this.recomputeStats();
    this.updateMuseumDisplays();
  }

  updateMuseumDisplays() {
    const slots = this.structures.museumSlots;
    if (!slots?.length) return;
    if (!this.museumMesh) {
      const geo = new THREE.OctahedronGeometry(0.28, 0);
      const mat = new THREE.MeshLambertNodeMaterial();
      this.museumMesh = new THREE.InstancedMesh(geo, mat, slots.length);
      this.museumMesh.frustumCulled = false;
      this.scene.add(this.museumMesh);
    }
    const ids = Object.keys(this.save.museum);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let n = 0;
    for (const id of ids) {
      if (n >= slots.length) break;
      const min = MINERAL_BY_ID[id];
      const p = slots[n];
      const s = 0.8 + Math.min(1.2, Math.sqrt(this.save.museum[id].kg / min.kg) * 0.4);
      m.compose(p, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, n, 0)), new THREE.Vector3(s, s * 1.3, s));
      this.museumMesh.setMatrixAt(n, m);
      this.museumMesh.setColorAt(n, c.set(min.colors[0]));
      n++;
    }
    this.museumMesh.count = n;
    this.museumMesh.instanceMatrix.needsUpdate = true;
    if (this.museumMesh.instanceColor) this.museumMesh.instanceColor.needsUpdate = true;
  }

  onGearChanged() {
    this.recomputeStats();
    this.saveSoon();
  }

  applyLook() {
    const L = this.save.look;
    this.player.char.look = { ...L };
    this.player.char.name = this.save.name;
    if (this.player.char._cols) this.chars.refreshLook(this.player.char);
  }

  // ------------------------------------------------------------------
  teleport(x, z) {
    const fade = document.getElementById('fade');
    fade.classList.add('on');
    this.audio.play('whoosh');
    setTimeout(() => {
      this.player.spawn(x, z, this.player.yaw);
      this.player.camPos.set(x, this.player.pos.y + 8, z + 10);
      this.terrain.prewarm(x, z);
      this.trackArea();
      setTimeout(() => fade.classList.remove('on'), 120);
    }, 380);
  }

  buildMapImage() {
    const w = this.world;
    const S = 512;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const img = g.createImageData(S, S);
    const n = w.n;
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const x = (px / S) * w.half * 2 - w.half;
        const z = (py / S) * w.half * 2 - w.half;
        const i = Math.min(n - 1, Math.round((x + w.half) / w.cell));
        const j = Math.min(n - 1, Math.round((z + w.half) / w.cell));
        const k = j * n + i;
        let r = w.colors[k * 3],
          gg = w.colors[k * 3 + 1],
          b = w.colors[k * 3 + 2];
        const h = w.heights[k];
        const hl = w.heights[Math.max(0, k - 2)];
        const hu = w.heights[Math.max(0, k - 2 * n)];
        const shade = Math.max(0.6, Math.min(1.25, 1 + (h - hl + h - hu) * 0.05));
        r *= shade;
        gg *= shade;
        b *= shade;
        const wl = w.water[k];
        if (wl > h) {
          const d = Math.min(1, (wl - h) / 6);
          if (w.waterType[k] === 4) {
            r = 255;
            gg = 90;
            b = 20;
          } else {
            r = r * 0.25 * (1 - d) + 40;
            gg = gg * 0.25 * (1 - d) + 120 - d * 30;
            b = 200 - d * 20;
          }
        }
        if (Math.abs(h % 25) < 0.5 && h > 2) {
          r *= 0.9;
          gg *= 0.9;
          b *= 0.9;
        }
        const o = (py * S + px) * 4;
        img.data[o] = r;
        img.data[o + 1] = gg;
        img.data[o + 2] = b;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // roads/decks
    g.fillStyle = '#7a5a3a';
    for (const d of w.decks) {
      g.save();
      g.translate(((d.x + w.half) / (w.half * 2)) * S, ((d.z + w.half) / (w.half * 2)) * S);
      g.rotate(-d.yaw);
      const sc = S / (w.half * 2);
      g.fillRect((-d.len / 2) * sc, (-d.wid / 2) * sc - 0.5, d.len * sc, Math.max(1.5, d.wid * sc));
      g.restore();
    }
    return c;
  }

  // ------------------------------------------------------------------
  saveSoon() {
    this.saveTimer = Math.min(this.saveTimer, 2);
  }

  saveGame(notify) {
    const s = this.save;
    const p = this.player?.pos;
    if (p) {
      s.pos = [Math.round(p.x * 10) / 10, Math.round(p.z * 10) / 10];
      s.yaw = this.player.yaw;
    }
    s.timeOfDay = this.env?.t ?? s.timeOfDay;
    // strip runtime-only fields from placeables
    const totems = s.totems;
    s.totems = totems.map(({ id, x, z, y, radius, left }) => ({ id, x, z, y, radius, left }));
    const ok = this.saves.write(this.slot, s);
    s.totems = totems;
    if (notify) this.hud.toast(ok ? '💾 Game saved!' : '⚠️ Could not save (storage full?)', ok ? 'good' : 'bad');
  }

  saveSettings() {
    try {
      localStorage.setItem('prospect.settings', JSON.stringify(this.settings));
    } catch (e) {
      /* ignore */
    }
  }

  applySettings(k) {
    const S = this.settings;
    if (k === 'all' || ['sfxVolume', 'ambVolume', 'musicVolume', 'muted'].includes(k)) this.audio.applyVolume();
    if (k === 'all' || ['renderScale', 'dynamicRes'].includes(k)) this.res.apply();
    if (k === 'all' || k === 'viewScale') {
      this.camera.far = this.quality.viewDist * (S.viewScale || 1);
      this.camera.updateProjectionMatrix();
    }
    if (k === 'all') this.updateMuseumDisplays();
  }

  reloadForSettings() {
    this.saveGame();
    try {
      sessionStorage.setItem('prospect.autostart', String(this.slot));
    } catch (e) {
      /* ignore */
    }
    location.reload();
  }
}

function tick() {
  return new Promise((r) => setTimeout(r, 0));
}
