// Persistent player state (save data) + derived stat computation.
import { PAN_BY_ID, SHOVEL_BY_ID, ENCHANT_BY_ID, RING_BY_ID, CONSUMABLE_BY_ID } from '../data/equipment.js';
import { MINERAL_BY_ID, MODIFIER_BY_ID, TIERS } from '../data/minerals.js';

export const SAVE_VERSION = 1;

export function newSave(name = 'Prospector') {
  return {
    v: SAVE_VERSION,
    name,
    created: Date.now(),
    updated: Date.now(),
    playTime: 0,
    money: 0,
    shards: 0,
    xp: 0,
    level: 1,
    pos: null,
    yaw: Math.PI / 2,
    timeOfDay: 0.3,
    inv: [],
    items: { geodes: {}, consumables: {}, sluices: {} },
    gear: { pans: ['rusty_pan'], shovels: ['rusty_shovel'], pan: 'rusty_pan', shovel: 'rusty_shovel', enchants: {} },
    rings: { owned: {}, equipped: [], slots: 2 },
    museum: {},
    quests: { active: {}, done: {} },
    bounties: { list: [], day: -1 },
    flags: {},
    discovered: { areas: {}, towns: { rubble: true }, minerals: {} },
    stats: { digs: 0, perfect: 0, pans: 0, found: 0, earned: 0, sold: 0, best: null, geodes: 0, shardsTotal: 0, legendaries: 0, mythics: 0, exotics: 0 },
    effects: [],
    totems: [],
    sluices: [],
    pan: { fill: 0, sites: {}, perfect: 0, digs: 0 },
    look: { shirt: '#3a86ff', pants: '#2b2d42', skin: '#f2c49b', hat: 'cowboy', hatColor: '#8a5a2b', face: 0 },
    autoSell: { enabled: false, maxTier: 0 },
  };
}

export function migrateSave(s) {
  const base = newSave(s.name);
  // shallow-merge missing keys so older saves keep working
  for (const k of Object.keys(base)) if (s[k] === undefined) s[k] = base[k];
  for (const k of ['items', 'gear', 'rings', 'quests', 'discovered', 'stats', 'pan', 'look', 'autoSell']) {
    for (const kk of Object.keys(base[k])) if (s[k][kk] === undefined) s[k][kk] = base[k][kk];
  }
  s.v = SAVE_VERSION;
  return s;
}

export function xpForLevel(level) {
  return Math.floor(80 * Math.pow(level, 1.75));
}

export const TIER_XP = [4, 12, 35, 110, 420, 1600, 7000];

// Museum bonus for one displayed specimen
export function museumBonus(entry) {
  const m = MINERAL_BY_ID[entry.id];
  if (!m) return {};
  const tier = TIERS[m.tier];
  const wf = Math.min(3, Math.max(0.5, Math.sqrt(entry.kg / m.kg)));
  const out = {};
  out[m.stat] = (out[m.stat] || 0) + tier.museum * wf;
  const modBase = [0.01, 0.01, 0.01, 0.02, 0.03, 0.05, 0.1][m.tier];
  for (const mid of entry.mods || []) {
    const mod = MODIFIER_BY_ID[mid];
    if (!mod) continue;
    const stats = mid === 'electrified' ? ['digSpeed', 'shakeSpeed'] : mid === 'voidtorn' ? ['luck', 'capacity'] : [mod.stat];
    for (const st of stats) out[st] = (out[st] || 0) + modBase;
  }
  return out;
}

export function museumTotals(museum) {
  const tot = {};
  for (const e of Object.values(museum)) {
    const b = museumBonus(e);
    for (const [k, v] of Object.entries(b)) tot[k] = (tot[k] || 0) + v;
  }
  return tot;
}

// env: { luckMult, sellMult, capacityMult, walkMult, digMult, shakeMult, shardMult, modMult, statusMods: {...} }
export function computeStats(save, env = {}) {
  const pan = PAN_BY_ID[save.gear.pan] || PAN_BY_ID.rusty_pan;
  const shovel = SHOVEL_BY_ID[save.gear.shovel] || SHOVEL_BY_ID.rusty_shovel;
  const s = {
    luck: pan.luck,
    capacity: pan.capacity,
    shakeStrength: pan.shakeStrength,
    shakeSpeed: pan.shakeSpeed,
    digStrength: shovel.digStrength,
    digSpeed: shovel.digSpeed,
    toughness: shovel.toughness,
    sellBoost: 0,
    sizeBoost: pan.sizeBoost || 0,
    modifierBoost: pan.modifierBoost || 0,
    perfectZone: 1,
    walkMult: 1,
    coldResist: 0,
    heatResist: 0,
    shardMult: pan.shardMult || 1,
    scorchMult: pan.scorchMult || 1,
  };
  const breakdown = { museum: {}, rings: {}, enchants: {} };
  const addStats = (stats, into) => {
    for (const [k, v] of Object.entries(stats)) {
      if (k === 'perfectZone') s.perfectZone *= v;
      else s[k] = (s[k] || 0) + v;
      into[k] = (into[k] || 0) + v;
    }
  };
  const pe = save.gear.enchants[save.gear.pan];
  if (pe && ENCHANT_BY_ID[pe]) addStats(ENCHANT_BY_ID[pe].stats, breakdown.enchants);
  const se = save.gear.enchants[save.gear.shovel];
  if (se && ENCHANT_BY_ID[se]) addStats(ENCHANT_BY_ID[se].stats, breakdown.enchants);
  for (const rid of save.rings.equipped) {
    const r = RING_BY_ID[rid];
    if (r) addStats(r.stats, breakdown.rings);
  }
  // museum (percentage multipliers for core stats, additive for boosts)
  const mus = museumTotals(save.museum);
  breakdown.museum = mus;
  for (const [k, v] of Object.entries(mus)) {
    if (['luck', 'capacity', 'digStrength', 'shakeStrength', 'digSpeed', 'shakeSpeed'].includes(k)) s[k] *= 1 + v;
    else s[k] = (s[k] || 0) + v;
  }
  // level
  const lvl = save.level - 1;
  s.luck *= 1 + 0.01 * lvl;
  s.sellBoost += 0.005 * lvl;
  breakdown.level = { luck: 0.01 * lvl, sellBoost: 0.005 * lvl };
  // potions (active effects)
  let luckMult = env.luckMult || 1,
    capMult = env.capacityMult || 1,
    sellMult = env.sellMult || 1,
    walkMult = env.walkMult || 1,
    digMult = env.digMult || 1,
    shakeMult = env.shakeMult || 1,
    shardMult = env.shardMult || 1,
    modMult = env.modMult || 1;
  for (const e of save.effects) {
    const c = CONSUMABLE_BY_ID[e.id];
    if (!c) continue;
    const ef = c.effect;
    if (ef.luckMult) luckMult *= ef.luckMult;
    if (ef.capacityMult) capMult *= ef.capacityMult;
    if (ef.sellMult) sellMult *= ef.sellMult;
    if (ef.walkMult) walkMult *= ef.walkMult;
    if (ef.coldResist) s.coldResist = 1;
    if (ef.heatResist) s.heatResist = 1;
  }
  s.luck *= luckMult;
  s.capacity = Math.round(s.capacity * capMult);
  s.sellMult = sellMult * (1 + s.sellBoost);
  s.walkMult *= walkMult;
  s.digStrength *= digMult;
  s.shakeStrength *= shakeMult;
  s.shardMult *= shardMult;
  s.modifierBoost = (1 + s.modifierBoost) * modMult - 1;
  if (env.status) {
    for (const st of env.status) {
      if (st.mods) {
        for (const [k, v] of Object.entries(st.mods)) s[k] *= v;
      }
    }
  }
  s.breakdown = breakdown;
  s.multipliers = { luckMult, capMult, sellMult, walkMult, digMult, shakeMult, shardMult, modMult };
  return s;
}

export function inventoryCount(save, mineralId) {
  let n = 0;
  for (const it of save.inv) if (it.id === mineralId) n++;
  return n;
}

export function countByTier(save, tier, excludeLocked = false) {
  let n = 0;
  for (const it of save.inv) {
    const m = MINERAL_BY_ID[it.id];
    if (m && m.tier === tier && (!excludeLocked || !it.locked)) n++;
  }
  return n;
}

// Remove n minerals of an id (cheapest/lightest first, skipping locked unless needed). Returns removed items.
export function takeMinerals(save, pred, n) {
  const candidates = save.inv.filter(pred).sort((a, b) => (a.locked === b.locked ? a.kg - b.kg : a.locked ? 1 : -1));
  const take = candidates.slice(0, n);
  if (take.length < n) return null;
  const set = new Set(take.map((t) => t.uid));
  save.inv = save.inv.filter((it) => !set.has(it.uid));
  return take;
}
