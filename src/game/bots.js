// Fake "server" population: prospector bots that dig, pan, sell, chat, celebrate and drop totems.
import { SITES } from '../data/sites.js';
import { DIG_SITES } from '../world/layout.js';
import { TOWNS } from '../data/places.js';
import { MINERALS, TIERS } from '../data/minerals.js';
import { PANS, SHOVELS } from '../data/equipment.js';

const NAMES = [
  'xX_GoldDigger_Xx', 'PanMaster2011', 'sandyboi42', 'Ore_Nado', 'NuggetNinja', 'Prospecta', 'shovel_knight', 'gemgoblin', 'CreekCrawler', 'RockHound99',
  'bling_bling_bob', 'DiamondDave', 'luckylucy07', 'Shiny_Sam', 'mudpie_mike', 'GravelGuru', 'quartzqueen', 'xPyriteKingx', 'PanicAtTheDisco', 'dig_dug_doug',
  'FlakeFinder', 'OreoOre', 'TheRealGoldRush', 'Jaxon_TheMiner', 'AmethystAva', 'noob_digger_3000', 'MythicHunter', 'Silt_Strider', 'Bedrock_Ben', 'TotemTom',
  'CopperCat', 'River_Rat', 'Lil_Prospector', 'Nugget_Nana', 'KaboomKyle', 'sparkle_sara', 'SluiceJuice', 'paydirt_pete', 'Golden_Goose', 'ZincZach',
];
const SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#34495e', '#ff6b9a', '#ffffff', '#222222', '#c0392b', '#16a085', '#8e44ad', '#2980b9', '#d35400'];
const PANTS = ['#2c3e50', '#34495e', '#1a1a2e', '#5d4037', '#3e2723', '#2d3436', '#0c2461', '#4a4a4a', '#6d4c41'];
const SKINS = ['#f2c49b', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#f1c27d', '#a8754f', '#ffe0bd'];
const HATS = ['cowboy', 'cap', 'miner', 'beanie', 'tophat', 'hood', null, null, 'cowboy', 'cap', 'miner'];

const CHAT = {
  greet: ['hi', 'hello!!', 'yo', 'sup guys', 'hey :)', 'wsg', 'hiii'],
  idle: ['anyone got a luck totem?', 'this spot is so good', 'need 2 more shards for a potion', 'how do u get to the caldera', 'my pan is full lol', 'grinding for the magnetic pan', 'is the meteor shower soon?', 'creek is so peaceful', 'lol i keep getting pyrite', 'what does the museum do', 'who wants to trade', 'brb', 'gold gold gold', 'this game is so addicting', 'anyone else farming here', 'perfect dig streak 12!!', 'just need $50k more', 'ok one more pan then i sleep'],
  find: ['YOOO', 'no wayyy', 'LETS GOOO', 'finally!!', 'W', 'omg omg omg', 'huge pull', 'insane luck rn'],
  react: ['gg', 'W', 'nice!!', 'congrats', 'lucky', 'no way', 'teach me', 'ur so lucky', 'insane'],
  event: ['METEOR SHOWER!!', 'everyone dig the craters', 'luck event lets go', 'rift is open go go go', 'storm time'],
  totem: ['placed a luck totem, come dig here!', 'totem down! free luck', 'strength totem up, enjoy'],
  cold: ['brr its cold up here', 'need a campfire', 'my hands are frozen lol'],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const SITE_WEIGHTS = [
  ['rubble_sands', 7],
  ['rubble_deposits', 4],
  ['fortune_river', 4],
  ['sunset_beach', 2],
  ['fortune_delta', 2],
  ['windswept_beach', 1.5],
  ['azuralite_oasis', 1],
  ['sunscorched_dunes', 1],
  ['crystal_caverns', 1.2],
  ['ancient_ruins', 0.8],
  ['frostbite_falls', 1],
  ['frozen_peak', 0.6],
  ['volcanic_sands', 1],
  ['magma_furnace', 0.7],
];
const SITE_FLAG = { crystal_caverns: 'cave_open', volcanic_sands: 'bridge_repaired', magma_furnace: 'bridge_repaired' };

export class Bots {
  constructor(game, count) {
    this.game = game;
    this.bots = [];
    this.chatTimer = 6;
    this.waterCache = {};
    this.totems = [];
    const used = new Set();
    for (let i = 0; i < count; i++) {
      let name;
      do name = pick(NAMES) + (Math.random() < 0.25 ? Math.floor(Math.random() * 99) : '');
      while (used.has(name));
      used.add(name);
      this.bots.push(this.makeBot(name, i));
    }
  }

  makeBot(name, i) {
    const tierIdx = Math.min(PANS.length - 1, Math.floor(Math.random() * 6));
    const char = {
      x: 0,
      y: 0,
      z: 0,
      yaw: Math.random() * 6,
      look: {
        shirt: pick(SHIRTS),
        pants: pick(PANTS),
        skin: pick(SKINS),
        hat: pick(HATS),
        hatColor: pick([...SHIRTS, '#8a5a2b', '#5d4037']),
        face: Math.floor(Math.random() * 4),
        sleeves: Math.random() < 0.7,
      },
      tool: 'shovel',
      panFill: 0,
      panColor: PANS[tierIdx].color,
      shovelColor: SHOVELS[Math.min(SHOVELS.length - 1, tierIdx)].color,
      name,
      isBot: true,
      anim: { state: 'idle', t: 0, phase: 0, actionT: 0 },
    };
    const wealth = Math.pow(10, 2.5 + Math.random() * 5.5);
    const bot = { char, name, state: 'init', t: 0, target: null, site: null, digsLeft: 0, stuck: 0, lastX: 0, lastZ: 0, speed: 6.5 + Math.random() * 2.5, luck: 1 + Math.random() * 3, money: Math.round(wealth), income: wealth * (0.002 + Math.random() * 0.004), level: Math.max(1, Math.round(Math.log10(wealth) * 6 - 10 + Math.random() * 6)) };
    return bot;
  }

  chooseSite(bot) {
    const flags = this.game.save.flags;
    const opts = SITE_WEIGHTS.filter(([id]) => !SITE_FLAG[id] || flags[SITE_FLAG[id]]);
    const total = opts.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [id, w] of opts) {
      r -= w;
      if (r <= 0) return id;
    }
    return opts[0][0];
  }

  shapesFor(siteId) {
    return DIG_SITES.filter((s) => s.id === siteId);
  }

  randomPointInSite(siteId) {
    const shapes = this.shapesFor(siteId);
    const s = pick(shapes);
    const t = Math.random();
    const a = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * s.r * 0.85;
    return { x: s.a[0] + (s.b[0] - s.a[0]) * t + Math.cos(a) * r, z: s.a[1] + (s.b[1] - s.a[1]) * t + Math.sin(a) * r };
  }

  waterPointsFor(siteId) {
    if (this.waterCache[siteId]) return this.waterCache[siteId];
    const w = this.game.world;
    const pts = [];
    for (const s of this.shapesFor(siteId)) {
      const cx = (s.a[0] + s.b[0]) / 2,
        cz = (s.a[1] + s.b[1]) / 2;
      for (let i = 0; i < 400 && pts.length < 40; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * (s.r + 45);
        const x = cx + Math.cos(a) * r,
          z = cz + Math.sin(a) * r;
        const h = w.heightAt(x, z);
        const wl = w.waterAt(x, z);
        if (wl < -900) continue;
        const d = wl - h;
        if (d > 0.3 && d < 1.1 && w.waterTypeAt(x, z) !== 4) pts.push({ x, z });
      }
    }
    this.waterCache[siteId] = pts;
    return pts;
  }

  place(bot) {
    bot.site = this.chooseSite(bot);
    const p = this.randomPointInSite(bot.site);
    bot.char.x = p.x;
    bot.char.z = p.z;
    bot.char.y = this.game.world.groundAt(p.x, p.z);
    bot.state = 'dig';
    bot.digsLeft = 3 + Math.floor(Math.random() * 6);
    bot.t = Math.random() * 2;
  }

  init() {
    for (const b of this.bots) {
      this.place(b);
      this.game.chars.add(b.char);
    }
  }

  say(bot, text, bubble = true) {
    this.game.chat.say(bot.name, text, bot.char.look.shirt);
    if (bubble) this.game.ui?.bubble(bot.char, text);
  }

  goTo(bot, x, z, next) {
    bot.target = { x, z };
    bot.state = 'walk';
    bot.next = next;
    bot.stuck = 0;
  }

  update(dt) {
    const g = this.game;
    const P = g.player.pos;
    const w = g.world;
    for (const bot of this.bots) {
      const c = bot.char;
      const far = Math.hypot(c.x - P.x, c.z - P.z) > 180;
      bot.t -= dt;
      const a = c.anim;
      switch (bot.state) {
        case 'walk': {
          const dx = bot.target.x - c.x,
            dz = bot.target.z - c.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.8 || (far && Math.random() < dt * 0.5)) {
            if (far) {
              c.x = bot.target.x;
              c.z = bot.target.z;
            }
            bot.state = bot.next;
            bot.t = 0.3;
            a.state = 'idle';
            break;
          }
          const sp = bot.speed;
          let nx = c.x + (dx / d) * sp * dt;
          let nz = c.z + (dz / d) * sp * dt;
          const out = g.colliders.resolve(nx, nz, 0.45, c.y, 2, { x: 0, z: 0 });
          nx = out.x;
          nz = out.z;
          c.yaw = Math.atan2(nx - c.x, nz - c.z);
          c.x = nx;
          c.z = nz;
          const ground = w.groundAt(nx, nz, c.y + 0.6);
          const wl = w.waterAt(nx, nz);
          const swim = wl > -900 && wl - ground > 1.45;
          c.y = swim ? wl - 1.25 : ground;
          a.state = swim ? 'swim' : 'walk';
          a.phase += sp * dt * 1.15;
          // stuck detection
          bot.stuck += dt;
          if (bot.stuck > 2) {
            const moved = Math.hypot(c.x - bot.lastX, c.z - bot.lastZ);
            bot.lastX = c.x;
            bot.lastZ = c.z;
            bot.stuck = 0;
            if (moved < 1.5) {
              if (Math.random() < 0.5 && !g.isVisibleToPlayer(c)) {
                c.x = bot.target.x;
                c.z = bot.target.z;
                c.y = w.groundAt(c.x, c.z);
              } else {
                bot.jumpT = 0.5;
                bot.state = bot.next;
                bot.t = 1;
              }
            }
          }
          if (Math.random() < dt * 0.04) bot.jumpT = 0.55;
          if (bot.jumpT > 0) {
            bot.jumpT -= dt;
            c.y += Math.sin(Math.max(0, bot.jumpT / 0.55) * Math.PI) * 1.4;
            a.state = 'jump';
          }
          break;
        }
        case 'dig': {
          c.tool = 'shovel';
          if (bot.t <= 0) {
            if (bot.digsLeft <= 0) {
              const wp = this.waterPointsFor(bot.site);
              if (wp.length) {
                const best = wp.reduce((b, p) => (Math.hypot(p.x - c.x, p.z - c.z) < Math.hypot(b.x - c.x, b.z - c.z) ? p : b), wp[0]);
                this.goTo(bot, best.x + (Math.random() - 0.5) * 2, best.z + (Math.random() - 0.5) * 2, 'shake');
              } else {
                bot.state = 'shake';
                bot.t = 0;
              }
              break;
            }
            bot.digsLeft--;
            bot.t = 1.2 + Math.random() * 0.6;
            a.state = 'dig';
            a.t = 0;
            bot.digAnim = 0;
            c.panFill = Math.min(1, c.panFill + 0.18);
          }
          if (a.state === 'dig') {
            bot.digAnim += dt / 0.55;
            a.actionT = Math.min(1, bot.digAnim);
            if (bot.digAnim >= 0.62 && !bot.dug && !far) {
              bot.dug = true;
              const fx = c.x + Math.sin(c.yaw) * 1.0,
                fz = c.z + Math.cos(c.yaw) * 1.0;
              const site = SITES[bot.site];
              if (g.player.pos.distanceTo({ x: c.x, y: c.y, z: c.z }) < 60) g.vfx.burst('dirt', fx, w.heightAt(fx, fz), fz, { n: 6, color: g.groundColorHex(site.ground) });
            }
            if (bot.digAnim >= 1) {
              a.state = 'idle';
              bot.dug = false;
            }
          }
          break;
        }
        case 'shake': {
          c.tool = 'pan';
          if (a.state !== 'shake') {
            a.state = 'shake';
            a.t = 0;
            bot.t = 3 + Math.random() * 5;
            c.yaw += (Math.random() - 0.5) * 1.5;
          }
          a.shaking = Math.sin(a.t * 1.3) > -0.6;
          c.panFill = Math.max(0, c.panFill - dt * 0.15);
          if (!far && a.shaking && Math.random() < dt * 5) {
            const fx = c.x + Math.sin(c.yaw) * 0.7,
              fz = c.z + Math.cos(c.yaw) * 0.7;
            const wl = w.waterAt(fx, fz);
            if (wl > -900) g.vfx.burst('splash', fx, wl, fz, { n: 3 });
          }
          if (bot.t <= 0) {
            c.panFill = 0;
            a.shaking = false;
            this.botFind(bot);
            const r = Math.random();
            if (r < 0.12) {
              const town = this.nearestTown(c.x, c.z);
              if (town) this.goTo(bot, town.x + (Math.random() - 0.5) * 8, town.z + (Math.random() - 0.5) * 8, 'idle');
              bot.idleT = 4 + Math.random() * 6;
            } else if (r < 0.2) {
              bot.state = 'idle';
              bot.idleT = 3 + Math.random() * 5;
            } else {
              const p = this.randomPointInSite(bot.site);
              this.goTo(bot, p.x, p.z, 'dig');
              bot.digsLeft = 3 + Math.floor(Math.random() * 6);
            }
            if (Math.random() < 0.04 && !far) this.relocate(bot);
          }
          break;
        }
        case 'celebrate': {
          if (bot.t <= 0) {
            const p = this.randomPointInSite(bot.site);
            this.goTo(bot, p.x, p.z, 'dig');
            bot.digsLeft = 4;
          }
          break;
        }
        case 'idle':
        default: {
          a.state = Math.random() < 0.002 ? 'wave' : a.state === 'wave' && a.t < 2 ? 'wave' : 'idle';
          bot.idleT = (bot.idleT ?? 2) - dt;
          if (bot.idleT <= 0) {
            const p = this.randomPointInSite(bot.site);
            this.goTo(bot, p.x, p.z, 'dig');
            bot.digsLeft = 3 + Math.floor(Math.random() * 5);
          }
        }
      }
      if (bot.state !== 'walk') c.y = Math.max(c.y, w.groundAt(c.x, c.z, c.y + 0.5) - 0.01);
    }
    for (const bot of this.bots) bot.money += bot.income * dt;
    // ambient chat
    this.chatTimer -= dt;
    if (this.chatTimer <= 0) {
      this.chatTimer = 10 + Math.random() * 22;
      const bot = pick(this.bots);
      const area = g.world.areaAt(bot.char.x, bot.char.z).id;
      const pool = area === 'frostbite' || area === 'peak' ? (Math.random() < 0.5 ? CHAT.cold : CHAT.idle) : Math.random() < 0.15 ? CHAT.greet : CHAT.idle;
      this.say(bot, pick(pool), Math.hypot(bot.char.x - P.x, bot.char.z - P.z) < 60);
    }
    // bot totems
    this.totemTimer = (this.totemTimer ?? 120) - dt;
    if (this.totemTimer <= 0) {
      this.totemTimer = 240 + Math.random() * 360;
      const near = this.bots.filter((b) => b.state === 'dig' && Math.hypot(b.char.x - P.x, b.char.z - P.z) < 200);
      const bot = near.length ? pick(near) : pick(this.bots);
      const kind = Math.random() < 0.7 ? 'luck_totem' : 'strength_totem';
      g.placeTotem(kind, bot.char.x + 2, bot.char.z + 2, bot.name, 180);
      this.say(bot, pick(CHAT.totem));
    }
  }

  relocate(bot) {
    // quietly move to a new site (simulates players leaving/joining areas)
    const old = bot.site;
    this.place(bot);
    if (old !== bot.site && Math.random() < 0.3) this.game.chat.system(`${bot.name} traveled to ${SITES[bot.site].name}`);
  }

  nearestTown(x, z) {
    let best = null,
      bd = 1e9;
    for (const t of TOWNS) {
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bd && d < 200) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  botFind(bot) {
    // simulate a pan result; rare ones get announced
    const r = Math.random();
    let tier = -1;
    if (r < 1 / 60000) tier = 6;
    else if (r < 1 / 2500) tier = 5;
    else if (r < 1 / 260) tier = 4;
    else if (r < 1 / 40) tier = 3;
    if (tier < 3) return;
    const site = SITES[bot.site];
    const list = site.loot[tier];
    if (!list || !list.length) return;
    const id = pick(list)[0];
    const m = MINERALS.find((x) => x.id === id);
    const kg = (m.kg * (0.6 + Math.random() * 2.5)).toFixed(2);
    const near = Math.hypot(bot.char.x - this.game.player.pos.x, bot.char.z - this.game.player.pos.z) < 90;
    if (tier >= 4) {
      this.game.chat.global(`${bot.name} found a ${TIERS[tier].name} ${m.name} (${kg}kg)!`, TIERS[tier].color);
      bot.state = 'celebrate';
      bot.char.anim.state = 'celebrate';
      bot.char.anim.t = 0;
      bot.t = 3;
      if (near) {
        this.game.vfx.beam(bot.char.x, bot.char.y, bot.char.z, TIERS[tier].glow, 3.5, 0.6);
        this.game.vfx.burst('sparkle', bot.char.x, bot.char.y + 1.4, bot.char.z, { n: 30, color: TIERS[tier].glow });
      }
      this.say(bot, pick(CHAT.find), near);
      // others react
      setTimeout(() => {
        const other = pick(this.bots);
        if (other !== bot) this.say(other, pick(CHAT.react), false);
      }, 1200 + Math.random() * 2500);
    } else if (near && Math.random() < 0.3) {
      this.say(bot, `got ${m.name}!`, true);
    }
  }

  reactToPlayer(tier) {
    if (tier < 4) return;
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        const bot = pick(this.bots);
        this.say(bot, pick(CHAT.react), Math.hypot(bot.char.x - this.game.player.pos.x, bot.char.z - this.game.player.pos.z) < 60);
      }, 800 + i * 1400 + Math.random() * 1200);
    }
  }

  reactToEvent() {
    if (Math.random() < 0.7) {
      setTimeout(() => this.say(pick(this.bots), pick(CHAT.event), false), 1500 + Math.random() * 3000);
    }
  }
}
