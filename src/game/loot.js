// Loot rolling: mineral choice by tier weights + luck, weights (kg), modifiers, values.
import { MINERAL_BY_ID, MODIFIERS, TIERS } from '../data/minerals.js';
import { SITES, TIER_BASE, TOUGHNESS_RARITY } from '../data/sites.js';

let uidCounter = Date.now() % 1e9;
export const newUid = () => (++uidCounter).toString(36);

export function tierMultiplier(tier, luck) {
  return Math.pow(Math.max(1, luck), TIERS[tier].luckExp);
}

// Build a weighted table for a site at a given luck. Returns [{id, w, tier}], total
export function buildTable(siteId, luck, extra = {}) {
  const site = SITES[siteId];
  const boost = TOUGHNESS_RARITY[site.toughness] || 1;
  const out = [];
  let total = 0;
  site.loot.forEach((list, tier) => {
    if (!list.length) return;
    const tierW = TIER_BASE[tier] * Math.pow(boost, tier) * tierMultiplier(tier, luck) * (extra.tierMult?.[tier] || 1);
    let sum = 0;
    for (const [, w] of list) sum += w;
    for (const [id, w] of list) {
      const ww = (tierW * w) / sum;
      out.push({ id, w: ww, tier });
      total += ww;
    }
  });
  return { entries: out, total };
}

export function pickFromTable(table, rand = Math.random) {
  let r = rand() * table.total;
  for (const e of table.entries) {
    r -= e.w;
    if (r <= 0) return e.id;
  }
  return table.entries[table.entries.length - 1].id;
}

// log-normal-ish weight around median kg
export function rollWeight(mineral, sizeMult, rand = Math.random) {
  // Box-Muller
  const u = Math.max(1e-9, rand());
  const v = rand();
  const n = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  let kg = mineral.kg * Math.exp(n * 0.62) * sizeMult;
  // rare "huge" outliers
  if (rand() < 0.012) kg *= 2.5 + rand() * 4;
  return Math.max(mineral.min, Math.min(mineral.max * Math.max(1, sizeMult), kg));
}

export function rollModifiers(ctx, rand = Math.random) {
  const mods = [];
  const boost = 1 + (ctx.modifierBoost || 0);
  for (const m of MODIFIERS) {
    let mult = boost;
    if (ctx.modMults && ctx.modMults[m.id]) mult *= ctx.modMults[m.id];
    if (m.id === 'frosted' && !ctx.cold) mult *= 0; // frosted only in cold places
    const p = mult / m.chance;
    if (rand() < p) {
      mods.push(m.id);
      if (mods.length >= 2) break;
    }
  }
  return mods;
}

export function mineralValue(item, sellMult = 1) {
  const m = MINERAL_BY_ID[item.id];
  if (!m) return 0;
  let v = m.price * item.kg;
  for (const mid of item.mods || []) {
    const mod = MODIFIERS.find((x) => x.id === mid);
    if (mod) v *= mod.mult;
  }
  return Math.round(v * sellMult);
}

// Roll a full pan. ctx: {sites: {siteId: amount}, fill, luck, sizeBoost, modifierBoost, modMults, cold, tierMult, extraRolls}
export function rollPan(ctx, rand = Math.random) {
  const fill = Math.max(0.5, ctx.fill);
  let count = Math.max(1, Math.round(Math.pow(fill, 0.62) * (0.85 + rand() * 0.3)));
  count += ctx.extraRolls || 0;
  const fillSize = 1 + Math.log2(1 + fill / 25) * 0.28;
  const sizeMult = fillSize * (1 + (ctx.sizeBoost || 0));
  const siteEntries = Object.entries(ctx.sites).filter(([, a]) => a > 0);
  const siteTotal = siteEntries.reduce((s, [, a]) => s + a, 0) || 1;
  const tables = {};
  const items = [];
  for (let i = 0; i < count; i++) {
    let r = rand() * siteTotal;
    let siteId = siteEntries[0][0];
    for (const [sid, a] of siteEntries) {
      r -= a;
      if (r <= 0) {
        siteId = sid;
        break;
      }
    }
    const t = (tables[siteId] ||= buildTable(siteId, ctx.luck, ctx));
    const id = pickFromTable(t, rand);
    const m = MINERAL_BY_ID[id];
    const kg = rollWeight(m, sizeMult * (ctx.siteSize?.[siteId] || 1), rand);
    const mods = rollModifiers({ ...ctx, modMults: { ...(ctx.modMults || {}), ...(ctx.siteMods?.[siteId] || {}) } }, rand);
    items.push({ uid: newUid(), id, kg: Math.round(kg * 1000) / 1000, mods, site: siteId, t: Date.now() });
  }
  return items;
}

export function chanceString(siteId, mineralId, luck) {
  const t = buildTable(siteId, luck);
  const e = t.entries.find((x) => x.id === mineralId);
  if (!e) return null;
  const p = e.w / t.total;
  if (p > 0.1) return `${(p * 100).toFixed(1)}%`;
  return `1 in ${formatInt(Math.round(1 / p))}`;
}

export function formatInt(n) {
  return Math.round(n).toLocaleString('en-US');
}
