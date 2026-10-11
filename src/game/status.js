// Status effects (environmental + gameplay) with stat modifiers, shown as HUD icons.
import { CAVERN } from '../world/layout.js';

export const STATUS_DEFS = {
  freezing: { name: 'Freezing', icon: '🥶', bad: true, desc: 'Moving and digging slower. Find a campfire or drink a Warmth Brew!' },
  frozen: { name: 'Frozen', icon: '🧊', bad: true, desc: 'Frozen solid! Get warm NOW.' },
  burning: { name: 'Burning', icon: '🔥', bad: true, desc: 'Ouch! Shaking is clumsy while on fire. Jump in water!' },
  wet: { name: 'Soaked', icon: '💧', desc: 'Wet hands shake faster (+10% shake speed), but you freeze twice as fast.' },
  in_the_zone: { name: 'In the Zone', icon: '🎯', desc: '3 Perfect Digs in a row! +15% Luck, +10% Dig Speed.' },
  sandblind: { name: 'Sand-Blind', icon: '🌪️', bad: true, desc: 'The sandstorm slows you down.' },
  energized: { name: 'Energized', icon: '⚡', desc: 'Solar energy! +25% Dig Speed.' },
  voidtouched: { name: 'Voidtouched', icon: '🌀', desc: 'The rift hums around you. +30% Luck.' },
  warm: { name: 'Cozy', icon: '♨️', desc: 'Warming by the fire.' },
  luck_totem: { name: 'Luck Totem', icon: '🍀', desc: 'x2 Luck near the totem.' },
  strength_totem: { name: 'Strength Totem', icon: '💪', desc: 'x1.5 Dig & Shake Strength near the totem.' },
  meteor_totem: { name: 'Meteor Totem', icon: '☄️', desc: 'x3 shards, x1.5 modifiers near the totem.' },
  hot_spring: { name: 'Hot Spring', icon: '🛁', desc: 'Relaxing! +20% Shake Speed.' },
};

export class Status {
  constructor(game) {
    this.game = game;
    this.list = {}; // id -> {t (remaining or -1), stacks}
    this.cold = 0; // 0..100
    this.perfectStreak = 0;
  }

  add(id, dur, extra = {}) {
    const cur = this.list[id];
    if (cur) cur.t = Math.max(cur.t, dur);
    else this.list[id] = { t: dur, ...extra };
  }

  remove(id) {
    delete this.list[id];
  }

  has(id) {
    return !!this.list[id];
  }

  applyBurn(dur) {
    if (this.game.stats.heatResist) return;
    if (!this.has('burning')) this.game.ui?.toast('🔥 You caught fire! Jump in water!', 'bad');
    this.add('burning', dur);
  }

  onPerfect(perfect) {
    if (perfect) {
      this.perfectStreak++;
      if (this.perfectStreak >= 3) {
        if (!this.has('in_the_zone')) this.game.ui?.floatText('IN THE ZONE!', '#ffd23f');
        this.add('in_the_zone', 30);
      }
    } else this.perfectStreak = 0;
  }

  // per-frame environmental checks
  update(dt) {
    const g = this.game;
    const p = g.player;
    const area = g.currentArea?.id;
    const ev = g.events;
    const stats = g.stats;
    // timers
    for (const [id, s] of Object.entries(this.list)) {
      if (s.t > 0) {
        s.t -= dt;
        if (s.t <= 0) delete this.list[id];
      }
    }
    // water
    if (p.swimming || (p.inWater && p.waterDepth > 1)) this.add('wet', 60);
    if (this.has('burning') && p.inWater) {
      this.remove('burning');
      g.ui?.toast('💨 Fire extinguished!');
    }
    if (p.inLava && !stats.heatResist) {
      this.applyBurn(8);
      p.vy = 9;
      p.onGround = false;
    }
    if (this.has('burning') && Math.random() < dt * 20) g.vfx.burst('ember', p.pos.x, p.pos.y + 1, p.pos.z);
    // cold
    const nearFire = g.nearCampfire(p.pos.x, p.pos.z, 7);
    const coldArea = area === 'frostbite' || area === 'peak' || (area === 'mountains' && p.pos.y > 70) || p.pos.y > 100;
    let coldRate = 0;
    if (coldArea) {
      coldRate = 2.5;
      if (g.env.isNight) coldRate *= 1.6;
      if (ev.isActive('blizzard')) coldRate *= 2.2;
      if (this.has('wet')) coldRate *= 2;
    }
    if (stats.coldResist || nearFire) coldRate = 0;
    if (coldRate > 0) this.cold = Math.min(100, this.cold + coldRate * dt);
    else this.cold = Math.max(0, this.cold - (nearFire ? 25 : 8) * dt);
    if (nearFire) this.add('warm', 1.5);
    if (this.cold >= 100) {
      this.list.frozen = { t: -1 };
      delete this.list.freezing;
    } else if (this.cold > 35) {
      this.list.freezing = { t: -1 };
      delete this.list.frozen;
    } else {
      delete this.list.freezing;
      delete this.list.frozen;
    }
    // sandstorm
    if (ev.isActive('sandstorm') && ['desert', 'oasis', 'ruins'].includes(area)) this.add('sandblind', 2);
    // solar flare
    if (ev.isActive('solar_flare') && ev.inFlare(p.pos.x, p.pos.z)) this.add('energized', 20);
    // rift
    if (ev.rift && Math.hypot(p.pos.x - ev.rift.x, p.pos.z - ev.rift.z) < 30) this.add('voidtouched', 3);
    // hot springs
    const wt = g.world.waterTypeAt(p.pos.x, p.pos.z);
    if (p.inWater && wt === 5) this.add('hot_spring', 30);
    // totems (placed by player or bots)
    for (const t of g.allTotems()) {
      if (Math.hypot(p.pos.x - t.x, p.pos.z - t.z) < t.radius) this.add(t.id, 1.5);
    }
  }

  // multipliers applied in computeStats
  statMods() {
    const out = [];
    const L = this.list;
    const env = { luckMult: 1, digMult: 1, shakeMult: 1, walkMult: 1, shardMult: 1, modMult: 1 };
    if (L.freezing) out.push({ mods: { walkMult: 0.75, digSpeed: 0.8, shakeSpeed: 0.85 } });
    if (L.frozen) out.push({ mods: { walkMult: 0.45, digSpeed: 0.5, shakeSpeed: 0.5 } });
    if (L.burning) out.push({ mods: { shakeSpeed: 0.7, walkMult: 1.15 } });
    if (L.wet) out.push({ mods: { shakeSpeed: 1.1 } });
    if (L.in_the_zone) out.push({ mods: { luck: 1.15, digSpeed: 1.1 } });
    if (L.sandblind) out.push({ mods: { walkMult: 0.82 } });
    if (L.energized) out.push({ mods: { digSpeed: 1.25 } });
    if (L.voidtouched) out.push({ mods: { luck: 1.3 } });
    if (L.hot_spring) out.push({ mods: { shakeSpeed: 1.2 } });
    if (L.luck_totem) env.luckMult *= 2;
    if (L.strength_totem) {
      env.digMult *= 1.5;
      env.shakeMult *= 1.5;
    }
    if (L.meteor_totem) {
      env.shardMult *= 3;
      env.modMult *= 1.5;
    }
    return { status: out, env };
  }
}
