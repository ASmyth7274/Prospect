// Modal panels: inventory, shops, merchant, museum, crafting, enchanting, quests, index, map, settings, dialogs.
import { MINERALS, MINERAL_BY_ID, TIERS, MODIFIERS, MODIFIER_BY_ID, STAT_NAMES, GEODES } from '../data/minerals.js';
import { PANS, SHOVELS, PAN_BY_ID, SHOVEL_BY_ID, PAN_ENCHANTS, SHOVEL_ENCHANTS, ENCHANT_BY_ID, RINGS, RING_BY_ID, RING_SLOT_COSTS, CONSUMABLES, CONSUMABLE_BY_ID, SLUICES, SLUICE_BY_ID, MAX_SLUICES } from '../data/equipment.js';
import { SITES } from '../data/sites.js';
import { QUESTS } from '../data/quests.js';
import { SHOP_STOCK } from '../data/npcs.js';
import { TOWNS } from '../data/places.js';
import { DIG_SITES } from '../world/layout.js';
import { mineralIcon, emojiIcon, panIcon, shovelIcon, geodeIcon, ringIcon } from './icons.js';
import { fmtMoney, fmtNum, fmtKg, fmtTime, fmtPct, esc } from './format.js';
import { mineralValue, chanceString } from '../game/loot.js';
import { museumBonus, museumTotals, inventoryCount } from '../game/state.js';
import { QUALITY_PRESETS } from '../engine/renderer.js';

const $ = (s, r = document) => r.querySelector(s);

const STAT_FMT = {
  luck: (v) => (v < 10 ? +v.toFixed(2) : Math.round(v * 10) / 10) + '',
  capacity: (v) => fmtNum(v),
  shakeStrength: (v) => (Math.round(v * 10) / 10).toString(),
  shakeSpeed: (v) => Math.round(v * 100) + '%',
  digStrength: (v) => (Math.round(v * 10) / 10).toString(),
  digSpeed: (v) => Math.round(v * 100) + '%',
  toughness: (v) => v,
  sellBoost: (v) => fmtPct(v),
  sizeBoost: (v) => fmtPct(v),
  modifierBoost: (v) => fmtPct(v),
};

function statLine(obj, keys, compare) {
  return keys
    .filter((k) => obj[k] !== undefined && obj[k] !== 0)
    .map((k) => {
      let cls = '';
      if (compare && compare[k] !== undefined) cls = obj[k] > compare[k] ? 'up' : obj[k] < compare[k] ? 'down' : '';
      return `<span class="${cls}">${STAT_NAMES[k] || k}: <b>${(STAT_FMT[k] || ((v) => v))(obj[k])}</b></span>`;
    })
    .join('');
}

function enchantStats(st) {
  return Object.entries(st)
    .map(([k, v]) => {
      if (k === 'perfectZone') return `x${v} Perfect zone`;
      if (['shakeSpeed', 'digSpeed', 'sellBoost', 'sizeBoost', 'modifierBoost'].includes(k)) return `${fmtPct(v)} ${STAT_NAMES[k]}`;
      if (k === 'coldResist') return 'Cold immunity';
      if (k === 'heatResist') return 'Heat immunity';
      return `${v > 0 ? '+' : ''}${v} ${STAT_NAMES[k] || k}`;
    })
    .join(', ');
}

export class UI {
  constructor(game) {
    this.game = game;
    this.root = $('#panel-root');
    this.current = null;
    this.state = {};
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.close();
    });
    this.root.addEventListener('click', (e) => this.onClick(e));
    this.root.addEventListener('change', (e) => this.onChange(e));
    this.root.addEventListener('input', (e) => this.onInput(e));
  }

  get save() {
    return this.game.save;
  }

  get isOpen() {
    return !!this.current;
  }

  open(name, arg) {
    this.current = name;
    this.arg = arg;
    this.root.classList.remove('hidden');
    this.game.player.locked = true;
    this.render();
    this.game.audio?.play('open');
  }

  close() {
    if (!this.current) return;
    this.current = null;
    this.root.classList.add('hidden');
    this.root.innerHTML = '';
    this.game.player.locked = false;
    this.game.input.mouseAction = false;
    this.game.saveSoon();
  }

  refresh() {
    if (this.current) this.render(true);
  }

  render(keepScroll) {
    const fn = this['p_' + this.current];
    if (!fn) return;
    const body = $('.body', this.root);
    const scroll = keepScroll && body ? body.scrollTop : 0;
    const { title, html, foot, tabs, wide } = fn.call(this, this.arg);
    this.root.innerHTML = `<div class="panel" ${wide ? 'style="width:min(1000px,96vw)"' : ''}><header><h2 class="stroke">${title}</h2><button class="x" data-a="close">✕</button></header>${tabs ? `<div class="tabs">${tabs}</div>` : ''}<div class="body">${html}</div>${foot ? `<div class="foot">${foot}</div>` : ''}</div>`;
    if (scroll) $('.body', this.root).scrollTop = scroll;
    this.afterRender?.();
    this.afterRender = null;
  }

  tabs(list, cur, key) {
    return list.map(([id, label]) => `<button class="tab ${cur === id ? 'on' : ''}" data-a="tab" data-k="${key}" data-v="${id}">${label}</button>`).join('');
  }

  onClick(e) {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const g = this.game;
    const a = b.dataset.a;
    const d = b.dataset;
    g.audio?.play('ui');
    const handler = this['a_' + a];
    if (handler) handler.call(this, d, b, e);
  }

  onChange(e) {
    const t = e.target;
    if (t.dataset.set) this.setSetting(t.dataset.set, t.type === 'checkbox' ? t.checked : t.type === 'range' ? parseFloat(t.value) : t.value);
  }

  onInput(e) {
    const t = e.target;
    if (t.dataset.set && t.type === 'range') this.setSetting(t.dataset.set, parseFloat(t.value), true);
  }

  // ---------- generic actions ----------
  a_close() {
    this.close();
  }
  a_tab(d) {
    this.state[d.k] = d.v;
    this.render();
  }
  a_open(d) {
    this.open(d.p, d.arg);
  }

  // =====================================================================
  // INVENTORY
  // =====================================================================
  p_inventory() {
    const tab = this.state.invTab || 'minerals';
    const tabs = this.tabs(
      [
        ['minerals', `⛏️ Minerals (${this.save.inv.length})`],
        ['items', '🎒 Items'],
        ['gear', '🔧 Gear'],
        ['rings', '💍 Rings'],
        ['stats', '📊 Stats'],
      ],
      tab,
      'invTab',
    );
    let html = '',
      foot = '';
    if (tab === 'minerals') ({ html, foot } = this.mineralGrid(false));
    else if (tab === 'items') html = this.itemsHtml();
    else if (tab === 'gear') html = this.gearHtml();
    else if (tab === 'rings') html = this.ringsHtml(false);
    else html = this.statsHtml();
    return { title: '🎒 Backpack', tabs, html, foot };
  }

  sortedInv() {
    const sort = this.state.sort || 'value';
    const sm = this.game.stats.sellMult;
    const inv = [...this.save.inv];
    const val = (it) => mineralValue(it, sm);
    if (sort === 'value') inv.sort((a, b) => val(b) - val(a));
    else if (sort === 'rarity') inv.sort((a, b) => MINERAL_BY_ID[b.id].tier - MINERAL_BY_ID[a.id].tier || val(b) - val(a));
    else if (sort === 'weight') inv.sort((a, b) => b.kg - a.kg);
    else inv.sort((a, b) => b.t - a.t);
    return inv;
  }

  mineralGrid(selling) {
    const sm = this.game.stats.sellMult;
    const inv = this.sortedInv();
    const sort = this.state.sort || 'value';
    const seg = ['value', 'rarity', 'weight', 'newest'].map((s) => `<button class="${sort === s ? 'on' : ''}" data-a="sort" data-v="${s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('');
    let html = `<div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap"><div class="seg">${seg}</div><span class="pill">Tap a mineral to ${selling ? 'sell' : 'lock/unlock'} it</span></div>`;
    if (!inv.length) html += `<div class="row"><div class="grow"><div class="t">Your backpack is empty</div><div class="d">Dig at a dig site, then pan the dirt in water to find minerals.</div></div></div>`;
    html += '<div class="grid">';
    const max = 400;
    for (const it of inv.slice(0, max)) {
      const m = MINERAL_BY_ID[it.id];
      const tier = TIERS[m.tier];
      const mods = (it.mods || []).map((x) => MODIFIER_BY_ID[x].name[0]).join('');
      html += `<div class="slot" style="--c:${tier.color}" data-a="${selling ? 'sellOne' : 'lockItem'}" data-uid="${it.uid}" title="${esc(this.itemTitle(it))}"><img src="${mineralIcon(it.id, it.mods)}">${it.locked ? '<span class="lock">🔒</span>' : ''}${mods ? `<span class="mods" style="color:${MODIFIER_BY_ID[it.mods[0]].color}">${mods}</span>` : ''}<div class="nm ${tier.rainbow ? 'rainbow' : ''}">${esc(m.name)}</div><div class="kg">${fmtKg(it.kg)}</div><div class="v">${fmtMoney(mineralValue(it, sm))}</div></div>`;
    }
    html += '</div>';
    if (inv.length > max) html += `<div class="d" style="margin-top:8px">+${inv.length - max} more…</div>`;
    const total = this.save.inv.filter((x) => !x.locked).reduce((s, it) => s + mineralValue(it, sm), 0);
    let foot = `<span class="pill">Unlocked value: <b style="color:var(--money)">${fmtMoney(total)}</b></span>`;
    if (selling) {
      foot += `<button class="btn gold" data-a="sellAll">💰 Sell All (${fmtMoney(total)})</button>`;
      for (let t = 0; t <= 2; t++) {
        const v = this.save.inv.filter((x) => !x.locked && MINERAL_BY_ID[x.id].tier <= t).reduce((s, it) => s + mineralValue(it, sm), 0);
        foot += `<button class="btn small blue" data-a="sellTier" data-t="${t}">Sell ≤ ${TIERS[t].name} (${fmtMoney(v)})</button>`;
      }
    }
    return { html, foot };
  }

  itemTitle(it) {
    const m = MINERAL_BY_ID[it.id];
    const mods = (it.mods || []).map((x) => MODIFIER_BY_ID[x].name + ` (x${MODIFIER_BY_ID[x].mult})`).join(', ');
    return `${m.name} • ${TIERS[m.tier].name}\n${fmtKg(it.kg)} • $${fmtNum(m.price)}/kg${mods ? '\n' + mods : ''}\n${m.desc}`;
  }

  a_sort(d) {
    this.state.sort = d.v;
    this.render(true);
  }
  a_lockItem(d) {
    const it = this.save.inv.find((x) => x.uid === d.uid);
    if (it) it.locked = !it.locked;
    this.render(true);
  }

  itemsHtml() {
    const s = this.save;
    let html = '<div class="sect">Geodes</div>';
    const geos = Object.entries(s.items.geodes).filter(([, n]) => n > 0);
    if (!geos.length) html += '<div class="d">No geodes. You sometimes find them while digging!</div>';
    for (const [id, n] of geos) {
      const gd = GEODES[id];
      html += `<div class="row"><img class="ic" src="${geodeIcon(gd)}"><div class="grow"><div class="t">${esc(gd.name)} x${n}</div><div class="d">Crack it open for ${gd.rolls[0]}-${gd.rolls[1]} minerals from ${esc(SITES[gd.site].name)} with x${gd.luck} luck.</div></div><button class="btn purple" data-a="openGeode" data-id="${id}">Open</button>${n > 1 ? `<button class="btn small purple" data-a="openGeode" data-id="${id}" data-all="1">Open all</button>` : ''}</div>`;
    }
    html += '<div class="sect">Potions & Totems</div>';
    const cons = Object.entries(s.items.consumables).filter(([, n]) => n > 0);
    if (!cons.length) html += '<div class="d">No potions or totems. Buy them from Rosie (Rubble Creek) or Stella (Fortune Town).</div>';
    for (const [id, n] of cons) {
      const c = CONSUMABLE_BY_ID[id];
      html += `<div class="row"><img class="ic" src="${emojiIcon(c.kind === 'totem' ? '🗿' : '🧪', c.color + '55')}"><div class="grow"><div class="t">${esc(c.name)} x${n}</div><div class="d">${esc(c.desc)}</div></div><button class="btn" data-a="useItem" data-id="${id}">${c.kind === 'totem' ? 'Place' : 'Drink'}</button></div>`;
    }
    html += `<div class="sect">Sluices (${s.sluices.length}/${MAX_SLUICES} placed)</div>`;
    const sl = Object.entries(s.items.sluices).filter(([, n]) => n > 0);
    if (!sl.length) html += '<div class="d">No sluices in your bag. Sal at the Delta sells them; Rosie has wooden ones.</div>';
    for (const [id, n] of sl) {
      const c = SLUICE_BY_ID[id];
      html += `<div class="row"><img class="ic" src="${emojiIcon('🪵', c.color + '66')}"><div class="grow"><div class="t">${esc(c.name)} x${n}</div><div class="d">${esc(c.desc)} Place it in shallow water near a dig site.</div></div><button class="btn blue" data-a="placeSluice" data-id="${id}">Place</button></div>`;
    }
    for (const [i, p] of s.sluices.entries()) {
      const c = SLUICE_BY_ID[p.type];
      html += `<div class="row owned"><img class="ic" src="${emojiIcon('💧', c.color + '66')}"><div class="grow"><div class="t">${esc(c.name)} @ ${esc(SITES[p.site]?.name || 'river')}</div><div class="d">Holding ${p.stored.length}/${c.capacity} minerals</div></div><button class="btn small gray" data-a="travelSluice" data-i="${i}">Go</button></div>`;
    }
    return html;
  }

  a_openGeode(d) {
    const n = d.all ? this.save.items.geodes[d.id] : 1;
    for (let i = 0; i < n; i++) this.game.openGeode(d.id);
    this.render(true);
  }
  a_useItem(d) {
    this.game.useConsumable(d.id);
    this.render(true);
  }
  a_placeSluice(d) {
    if (this.game.placeSluice(d.id)) this.close();
  }
  a_travelSluice(d) {
    const p = this.save.sluices[+d.i];
    if (p) {
      this.close();
      this.game.teleport(p.x + 3, p.z + 3);
    }
  }

  gearHtml() {
    const s = this.save;
    const st = this.game.stats;
    let html = `<div class="sect">Pans</div>`;
    for (const id of s.gear.pans) {
      const p = PAN_BY_ID[id];
      const eq = s.gear.pan === id;
      const en = s.gear.enchants[id] ? ENCHANT_BY_ID[s.gear.enchants[id]] : null;
      html += `<div class="row ${eq ? 'equipped' : 'owned'}"><img class="ic" src="${panIcon(p)}"><div class="grow"><div class="t">${esc(p.name)} ${en ? `<span class="pill ${en.rainbow ? 'rainbow' : ''}" style="color:${en.color}">✨ ${esc(en.name)}</span>` : ''}</div><div class="stats">${statLine(p, ['luck', 'capacity', 'shakeStrength', 'shakeSpeed'])}</div>${p.passive ? `<div class="d">Passive: ${esc(p.passive)}</div>` : ''}</div>${eq ? '<span class="pill">Equipped</span>' : `<button class="btn" data-a="equip" data-k="pan" data-id="${id}">Equip</button>`}</div>`;
    }
    html += `<div class="sect">Shovels</div>`;
    for (const id of s.gear.shovels) {
      const p = SHOVEL_BY_ID[id];
      const eq = s.gear.shovel === id;
      const en = s.gear.enchants[id] ? ENCHANT_BY_ID[s.gear.enchants[id]] : null;
      html += `<div class="row ${eq ? 'equipped' : 'owned'}"><img class="ic" src="${shovelIcon(p)}"><div class="grow"><div class="t">${esc(p.name)} ${en ? `<span class="pill ${en.rainbow ? 'rainbow' : ''}" style="color:${en.color}">✨ ${esc(en.name)}</span>` : ''}</div><div class="stats">${statLine(p, ['digStrength', 'digSpeed', 'toughness'])}</div></div>${eq ? '<span class="pill">Equipped</span>' : `<button class="btn" data-a="equip" data-k="shovel" data-id="${id}">Equip</button>`}</div>`;
    }
    html += `<div class="sect">Appearance</div><div class="row"><div class="grow"><div class="t">Customize your prospector</div><div class="d">Shirt, pants, skin, hat and face.</div></div><button class="btn blue" data-a="open" data-p="avatar">Customize</button></div>`;
    return html;
  }

  a_equip(d) {
    const s = this.save;
    if (d.k === 'pan') s.gear.pan = d.id;
    else s.gear.shovel = d.id;
    this.game.onGearChanged();
    this.render(true);
  }

  ringsHtml(atAnvil) {
    const s = this.save;
    let html = `<div class="sect">Equipped Rings (${s.rings.equipped.length}/${s.rings.slots} slots)</div>`;
    html += '<div class="grid">';
    for (let i = 0; i < s.rings.slots; i++) {
      const rid = s.rings.equipped[i];
      if (rid) {
        const r = RING_BY_ID[rid];
        html += `<div class="slot" style="--c:${r.color}" data-a="unequipRing" data-i="${i}" title="Tap to unequip"><img src="${ringIcon(r)}"><div class="nm ${r.rainbow ? 'rainbow' : ''}">${esc(r.name)}</div><div class="kg">${esc(enchantStats(r.stats))}</div></div>`;
      } else html += `<div class="slot"><img src="${emojiIcon('➕', '#2a3350')}"><div class="nm" style="color:var(--muted)">Empty</div></div>`;
    }
    html += '</div>';
    const nextCost = RING_SLOT_COSTS[s.rings.slots];
    if (nextCost !== undefined) html += `<div class="row" style="margin-top:8px"><div class="grow"><div class="t">Unlock ring slot ${s.rings.slots + 1}</div><div class="d">More rings, more power.</div></div><span class="price sh">◆ ${nextCost}</span><button class="btn purple" data-a="buySlot" ${s.shards < nextCost ? 'disabled' : ''}>Unlock</button></div>`;
    html += '<div class="sect">Owned Rings</div>';
    const owned = Object.entries(s.rings.owned).filter(([, n]) => n > 0);
    if (!owned.length) html += `<div class="d">No rings yet. ${atAnvil ? 'Craft one below!' : 'Craft them at Bram’s Forge in Fortune Town.'}</div>`;
    for (const [id, n] of owned) {
      const r = RING_BY_ID[id];
      const eqCount = s.rings.equipped.filter((x) => x === id).length;
      const free = n - eqCount;
      html += `<div class="row"><img class="ic" src="${ringIcon(r)}"><div class="grow"><div class="t">${esc(r.name)} x${n}</div><div class="d">${esc(enchantStats(r.stats))}</div></div>${free > 0 && s.rings.equipped.length < s.rings.slots ? `<button class="btn" data-a="equipRing" data-id="${id}">Equip</button>` : `<span class="pill">${eqCount} equipped</span>`}</div>`;
    }
    return html;
  }

  a_equipRing(d) {
    const s = this.save;
    if (s.rings.equipped.length < s.rings.slots) s.rings.equipped.push(d.id);
    this.game.onGearChanged();
    this.render(true);
  }
  a_unequipRing(d) {
    this.save.rings.equipped.splice(+d.i, 1);
    this.game.onGearChanged();
    this.render(true);
  }
  a_buySlot() {
    const s = this.save;
    const c = RING_SLOT_COSTS[s.rings.slots];
    if (c !== undefined && s.shards >= c) {
      s.shards -= c;
      s.rings.slots++;
      this.game.audio.play('buy');
    }
    this.render(true);
  }

  statsHtml() {
    const st = this.game.stats;
    const s = this.save;
    const b = st.breakdown;
    const mm = st.multipliers;
    const row = (k, v) => `<div>${k}</div><div>${v}</div>`;
    let html = '<div class="sect">Your Stats</div><div class="kv">';
    html += row('🍀 Luck', fmtNum(st.luck * 10) / 10);
    html += row('🍳 Capacity', fmtNum(st.capacity));
    html += row('⛏️ Dig Strength', Math.round(st.digStrength * 10) / 10);
    html += row('⏱️ Dig Speed', Math.round(st.digSpeed * 100) + '%');
    html += row('🪨 Toughness', st.toughness);
    html += row('💪 Shake Strength', Math.round(st.shakeStrength * 10) / 10);
    html += row('🌀 Shake Speed', Math.round(st.shakeSpeed * 100) + '%');
    html += row('💰 Sell Value', 'x' + st.sellMult.toFixed(2));
    html += row('📏 Size Boost', fmtPct(st.sizeBoost));
    html += row('✨ Modifier Boost', fmtPct(st.modifierBoost));
    html += row('🎯 Perfect Zone', 'x' + st.perfectZone.toFixed(2));
    html += row('☄️ Shard Chance', 'x' + st.shardMult.toFixed(1));
    html += '</div><div class="sect">Active Multipliers</div><div class="kv">';
    html += row('Luck', 'x' + mm.luckMult.toFixed(2));
    html += row('Sell', 'x' + mm.sellMult.toFixed(2));
    html += row('Capacity', 'x' + mm.capMult.toFixed(2));
    html += row('Level bonus', `+${s.level - 1}% Luck, +${((s.level - 1) * 0.5).toFixed(1)}% Sell`);
    html += '</div><div class="sect">Museum Bonuses</div><div class="kv">';
    const mus = Object.entries(b.museum);
    if (!mus.length) html += row('None yet', 'Display minerals in the Museum!');
    for (const [k, v] of mus) html += row(STAT_NAMES[k] || k, fmtPct(v));
    html += '</div><div class="sect">Lifetime</div><div class="kv">';
    const S = s.stats;
    html += row('Play time', fmtTime(s.playTime));
    html += row('Digs (perfect)', `${fmtNum(S.digs)} (${fmtNum(S.perfect)})`);
    html += row('Pans', fmtNum(S.pans));
    html += row('Minerals found', fmtNum(S.found));
    html += row('Money earned', fmtMoney(S.earned));
    html += row('Legendary / Mythic / Exotic', `${S.legendaries} / ${S.mythics} / ${S.exotics}`);
    if (S.best) html += row('Best find', `${esc(MINERAL_BY_ID[S.best.id].name)} ${fmtKg(S.best.kg)} (${fmtMoney(S.best.value)})`);
    html += '</div>';
    return html;
  }

  // =====================================================================
  // MERCHANT (sell)
  // =====================================================================
  p_merchant(npc) {
    const { html, foot } = this.mineralGrid(true);
    const geos = Object.entries(this.save.items.geodes).filter(([, n]) => n > 0);
    let extra = '';
    if (geos.length) {
      extra = '<div class="sect">Sell Geodes</div>';
      for (const [id, n] of geos) extra += `<div class="row"><img class="ic" src="${geodeIcon(GEODES[id])}"><div class="grow"><div class="t">${esc(GEODES[id].name)} x${n}</div></div><span class="price">${fmtMoney(GEODES[id].price)}</span><button class="btn small" data-a="sellGeode" data-id="${id}">Sell 1</button></div>`;
    }
    const sm = this.game.stats.sellMult;
    const head = `<div class="dialog" style="margin-bottom:10px"><div class="face" style="background:${npc?.look?.shirt || '#27ae60'}">💰</div><div class="say">${esc(npc?.greet?.[0] || 'Got rocks? I’ve got cash.')}<br><span class="d">Your sell multiplier: <b>x${sm.toFixed(2)}</b>. Tap a mineral to sell it, or Sell All. Locked 🔒 minerals are never sold.</span></div></div>`;
    return { title: `💰 ${esc(npc?.name || 'Merchant')}`, html: head + html + extra, foot };
  }

  a_sellOne(d) {
    const it = this.save.inv.find((x) => x.uid === d.uid);
    if (!it) return;
    if (it.locked) {
      this.game.ui?.toast('That mineral is locked 🔒');
      return;
    }
    this.game.sellItems([it]);
    this.render(true);
  }
  a_sellAll() {
    this.game.sellItems(this.save.inv.filter((x) => !x.locked));
    this.render(true);
  }
  a_sellTier(d) {
    const t = +d.t;
    this.game.sellItems(this.save.inv.filter((x) => !x.locked && MINERAL_BY_ID[x.id].tier <= t));
    this.render(true);
  }
  a_sellGeode(d) {
    const s = this.save;
    if (s.items.geodes[d.id] > 0) {
      s.items.geodes[d.id]--;
      this.game.addMoney(GEODES[d.id].price);
      this.game.audio.play('coin');
    }
    this.render(true);
  }

  // =====================================================================
  // SHOP (equipment)
  // =====================================================================
  p_shop(shopId) {
    const stock = SHOP_STOCK[shopId];
    const s = this.save;
    const st = this.game.stats;
    const curPan = PAN_BY_ID[s.gear.pan];
    const curSh = SHOVEL_BY_ID[s.gear.shovel];
    let html = `<div class="dialog" style="margin-bottom:10px"><div class="face" style="background:#e67e22">🛠️</div><div class="say">Better gear = more dirt, more luck, harder sand.<br><span class="d">Shovel <b>Toughness</b> decides which dig sites you can break into. Pan <b>Luck</b> finds rarer minerals.</span></div></div>`;
    if (stock.requiresFlag && !s.flags[stock.requiresFlag]) {
      html += `<div class="row"><div class="grow"><div class="t">🔒 Locked</div><div class="d">Complete Ada's quests to unlock this shop.</div></div></div>`;
      return { title: esc(stock.title), html };
    }
    if (stock.pans.length) html += '<div class="sect">Pans</div>';
    for (const id of stock.pans) {
      const p = PAN_BY_ID[id];
      const owned = s.gear.pans.includes(id);
      html += `<div class="row ${owned ? 'owned' : ''}"><img class="ic" src="${panIcon(p)}"><div class="grow"><div class="t">${esc(p.name)}</div><div class="stats">${statLine(p, ['luck', 'capacity', 'shakeStrength', 'shakeSpeed'], curPan)}</div><div class="d">${esc(p.desc)}${p.passive ? ' • <b>' + esc(p.passive) + '</b>' : ''}</div></div>${owned ? '<span class="pill">Owned</span>' : `<span class="price">${fmtMoney(p.price)}</span><button class="btn" data-a="buyGear" data-k="pan" data-id="${id}" ${s.money < p.price ? 'disabled' : ''}>Buy</button>`}</div>`;
    }
    if (stock.shovels.length) html += '<div class="sect">Shovels</div>';
    for (const id of stock.shovels) {
      const p = SHOVEL_BY_ID[id];
      const owned = s.gear.shovels.includes(id);
      html += `<div class="row ${owned ? 'owned' : ''}"><img class="ic" src="${shovelIcon(p)}"><div class="grow"><div class="t">${esc(p.name)}</div><div class="stats">${statLine(p, ['digStrength', 'digSpeed', 'toughness'], curSh)}</div><div class="d">${esc(p.desc)}</div></div>${owned ? '<span class="pill">Owned</span>' : `<span class="price">${fmtMoney(p.price)}</span><button class="btn" data-a="buyGear" data-k="shovel" data-id="${id}" ${s.money < p.price ? 'disabled' : ''}>Buy</button>`}</div>`;
    }
    if (stock.consumables) {
      html += '<div class="sect">Supplies</div>';
      html += this.consumableRows(stock.consumables);
    }
    return { title: esc(stock.title), html, foot: `<span class="pill">Money: <b style="color:var(--money)">${fmtMoney(s.money)}</b></span>` };
  }

  a_buyGear(d) {
    const s = this.save;
    const item = d.k === 'pan' ? PAN_BY_ID[d.id] : SHOVEL_BY_ID[d.id];
    if (s.money < item.price) return this.game.audio.play('error');
    s.money -= item.price;
    if (d.k === 'pan') {
      s.gear.pans.push(d.id);
      s.gear.pan = d.id;
    } else {
      s.gear.shovels.push(d.id);
      s.gear.shovel = d.id;
    }
    this.game.audio.play('buy');
    this.game.hud.toast(`🛒 Bought & equipped ${item.name}!`, 'good');
    this.game.quests.onBuy();
    this.game.onGearChanged();
    this.render(true);
  }

  consumableRows(ids) {
    const s = this.save;
    let html = '';
    for (const id of ids) {
      const c = CONSUMABLE_BY_ID[id];
      const have = s.items.consumables[id] || 0;
      const afford = c.cur === '$' ? s.money >= c.price : s.shards >= c.price;
      html += `<div class="row"><img class="ic" src="${emojiIcon(c.kind === 'totem' ? '🗿' : '🧪', c.color + '55')}"><div class="grow"><div class="t">${esc(c.name)} ${have ? `<span class="pill">x${have}</span>` : ''}</div><div class="d">${esc(c.desc)}</div></div><span class="price ${c.cur === '$' ? '' : 'sh'}">${c.cur === '$' ? fmtMoney(c.price) : '◆ ' + c.price}</span><button class="btn ${c.cur === '$' ? '' : 'purple'}" data-a="buyCons" data-id="${id}" ${afford ? '' : 'disabled'}>Buy</button></div>`;
    }
    return html;
  }

  a_buyCons(d) {
    const s = this.save;
    const c = CONSUMABLE_BY_ID[d.id];
    if (c.cur === '$') {
      if (s.money < c.price) return this.game.audio.play('error');
      s.money -= c.price;
    } else {
      if (s.shards < c.price) return this.game.audio.play('error');
      s.shards -= c.price;
    }
    s.items.consumables[d.id] = (s.items.consumables[d.id] || 0) + 1;
    this.game.audio.play('buy');
    this.game.hud.toast(`🛒 Bought ${c.name}`, 'good');
    this.render(true);
  }

  p_supplies() {
    const s = this.save;
    let html = `<div class="dialog" style="margin-bottom:10px"><div class="face" style="background:#ff7aa8">🧪</div><div class="say">Potions to boost your luck and speed, plus sluices that pan for you while you're busy!</div></div>`;
    html += '<div class="sect">Potions</div>' + this.consumableRows(['basic_luck', 'speed_potion']);
    html += '<div class="sect">Sluices</div>' + this.sluiceRows(['wood_sluice', 'iron_sluice']);
    return { title: '🧪 Rubble Supplies', html, foot: `<span class="pill">Money: <b style="color:var(--money)">${fmtMoney(s.money)}</b></span>` };
  }

  p_sluice() {
    const s = this.save;
    let html = `<div class="dialog" style="margin-bottom:10px"><div class="face" style="background:#16a085">🪵</div><div class="say">Drop a sluice in shallow water near a dig site and it'll catch minerals while you do other things, even while you're offline! Come back and collect.<br><span class="d">Max ${MAX_SLUICES} placed at once.</span></div></div>`;
    html += this.sluiceRows(SLUICES.map((x) => x.id));
    return { title: "🪵 Sal's Sluices", html, foot: `<span class="pill">Money: <b style="color:var(--money)">${fmtMoney(s.money)}</b></span>` };
  }

  sluiceRows(ids) {
    const s = this.save;
    let html = '';
    for (const id of ids) {
      const c = SLUICE_BY_ID[id];
      const have = s.items.sluices[id] || 0;
      html += `<div class="row"><img class="ic" src="${emojiIcon('🪵', c.color + '66')}"><div class="grow"><div class="t">${esc(c.name)} ${have ? `<span class="pill">x${have}</span>` : ''}</div><div class="d">${esc(c.desc)}</div></div><span class="price">${fmtMoney(c.price)}</span><button class="btn" data-a="buySluice" data-id="${id}" ${s.money >= c.price ? '' : 'disabled'}>Buy</button></div>`;
    }
    return html;
  }

  a_buySluice(d) {
    const s = this.save;
    const c = SLUICE_BY_ID[d.id];
    if (s.money < c.price) return this.game.audio.play('error');
    s.money -= c.price;
    s.items.sluices[d.id] = (s.items.sluices[d.id] || 0) + 1;
    this.game.audio.play('buy');
    this.game.quests.onBuy();
    this.game.hud.toast(`🛒 Bought ${c.name}! Place it from your Backpack → Items.`, 'good');
    this.render(true);
  }

  p_shards() {
    const s = this.save;
    let html = `<div class="dialog" style="margin-bottom:10px"><div class="face" style="background:#4b2a8a">🔭</div><div class="say">Meteor Shards fall from the sky. You find them while digging, and far more during a Meteor Shower. Spend them here!</div></div>`;
    html += '<div class="sect">Potions</div>' + this.consumableRows(['greater_luck', 'greater_capacity', 'merchants_potion']);
    html += '<div class="sect">Totems</div>' + this.consumableRows(['luck_totem', 'strength_totem', 'meteor_totem']);
    return { title: "🔭 Stella's Stargazing", html, foot: `<span class="pill">Shards: <b style="color:var(--shard)">◆ ${fmtNum(s.shards)}</b></span>` };
  }

  // =====================================================================
  // MUSEUM
  // =====================================================================
  p_museum() {
    const s = this.save;
    const tot = museumTotals(s.museum);
    const count = Object.keys(s.museum).length;
    let html = `<div class="dialog" style="margin-bottom:10px"><div class="face" style="background:#2c3e50">🏛️</div><div class="say">Each display case holds one specimen of a mineral. Displays give you <b>permanent stat boosts</b>. Heavier specimens and modifiers give bigger boosts! Displayed minerals leave your backpack (the old specimen is returned).</div></div>`;
    html += `<div class="row"><div class="grow"><div class="t">${count} / ${MINERALS.length} displayed</div><div class="stats">${Object.entries(tot)
      .map(([k, v]) => `<span class="up">${STAT_NAMES[k]} ${fmtPct(v)}</span>`)
      .join('')}</div></div><button class="btn gold" data-a="museumAuto">✨ Display best</button></div>`;
    for (let t = 0; t < TIERS.length; t++) {
      html += `<div class="sect" style="color:${TIERS[t].color}">${TIERS[t].name}</div><div class="grid">`;
      for (const m of MINERALS.filter((x) => x.tier === t)) {
        const e = s.museum[m.id];
        const cand = this.bestCandidate(m.id);
        const better = cand && (!e || this.bonusScore(cand) > this.bonusScore(e));
        if (e) {
          const b = museumBonus(e);
          html += `<div class="slot" style="--c:${TIERS[t].color}" ${better ? `data-a="display" data-uid="${cand.uid}"` : ''} title="${esc(m.name)} ${fmtKg(e.kg)}"><img src="${mineralIcon(m.id, e.mods)}"><div class="nm">${esc(m.name)}</div><div class="kg">${fmtKg(e.kg)}</div><div class="v" style="color:var(--gold)">${Object.entries(b)
            .map(([k, v]) => fmtPct(v) + ' ' + (STAT_NAMES[k] || k).split(' ')[0])
            .join(' ')}</div>${better ? '<span class="lock">⬆️</span>' : ''}</div>`;
        } else {
          html += `<div class="slot ${cand ? '' : 'unknown'}" style="--c:${cand ? TIERS[t].color : 'rgba(255,255,255,.08)'}" ${cand ? `data-a="display" data-uid="${cand.uid}"` : ''}><img src="${mineralIcon(m.id)}"><div class="nm" style="color:var(--muted)">${s.discovered.minerals[m.id] ? esc(m.name) : '???'}</div><div class="kg">${STAT_NAMES[m.stat]}</div>${cand ? '<div class="v">Tap to display</div>' : ''}</div>`;
        }
      }
      html += '</div>';
    }
    return { title: '🏛️ Fortune Museum', html, wide: true };
  }

  bonusScore(e) {
    return Object.values(museumBonus(e)).reduce((a, b) => a + b, 0);
  }

  bestCandidate(id) {
    let best = null,
      bs = -1;
    for (const it of this.save.inv) {
      if (it.id !== id) continue;
      const sc = this.bonusScore(it);
      if (sc > bs) {
        bs = sc;
        best = it;
      }
    }
    return best;
  }

  a_display(d) {
    this.game.displayInMuseum(d.uid);
    this.render(true);
  }
  a_museumAuto() {
    let n = 0;
    for (const m of MINERALS) {
      const cand = this.bestCandidate(m.id);
      const e = this.save.museum[m.id];
      if (cand && (!e || this.bonusScore(cand) > this.bonusScore(e))) {
        this.game.displayInMuseum(cand.uid, true);
        n++;
      }
    }
    this.game.hud.toast(n ? `🏛️ Displayed ${n} specimen${n > 1 ? 's' : ''}!` : 'Nothing better to display right now.');
    if (n) this.game.audio.play('quest');
    this.render(true);
  }

  // =====================================================================
  // ANVIL (crafting)
  // =====================================================================
  p_anvil(npc) {
    const s = this.save;
    const tab = this.state.anvilTab || 'craft';
    const tabs = this.tabs(
      [
        ['craft', '🔨 Craft'],
        ['rings', '💍 My Rings'],
      ],
      tab,
      'anvilTab',
    );
    let html = '';
    if (tab === 'rings') html = this.ringsHtml(true);
    else {
      html = `<div class="dialog" style="margin-bottom:10px"><div class="face" style="background:#5d4037">🔨</div><div class="say">Rings give permanent stats while equipped. Bring the minerals and the coin, and I'll forge it.</div></div>`;
      for (const r of RINGS) {
        const ok = r.ingredients.every(([id, n]) => inventoryCount(s, id) >= n) && s.money >= r.cost;
        const ing = r.ingredients
          .map(([id, n]) => {
            const have = inventoryCount(s, id);
            const known = s.discovered.minerals[id];
            return `<span style="color:${have >= n ? 'var(--money)' : 'var(--bad)'}">${known ? esc(MINERAL_BY_ID[id].name) : '???'} ${have}/${n}</span>`;
          })
          .join(' • ');
        html += `<div class="row"><img class="ic" src="${ringIcon(r)}"><div class="grow"><div class="t ${r.rainbow ? 'rainbow' : ''}">${esc(r.name)} ${s.rings.owned[r.id] ? `<span class="pill">x${s.rings.owned[r.id]}</span>` : ''}</div><div class="d" style="color:#dfe7ff">${esc(enchantStats(r.stats))}</div><div class="d">${ing}</div></div><span class="price">${fmtMoney(r.cost)}</span><button class="btn gold" data-a="craft" data-id="${r.id}" ${ok ? '' : 'disabled'}>Craft</button></div>`;
      }
    }
    return { title: "🔨 Bram's Forge", tabs, html };
  }

  a_craft(d) {
    this.game.craftRing(d.id);
    this.render(true);
  }

  // =====================================================================
  // ALTAR (enchanting)
  // =====================================================================
  p_altar() {
    const s = this.save;
    const target = this.state.enchTarget || 'pan';
    const tabs = this.tabs(
      [
        ['pan', '🍳 Enchant Pan'],
        ['shovel', '⛏️ Enchant Shovel'],
      ],
      target,
      'enchTarget',
    );
    const gearId = target === 'pan' ? s.gear.pan : s.gear.shovel;
    const gear = target === 'pan' ? PAN_BY_ID[gearId] : SHOVEL_BY_ID[gearId];
    const cur = s.gear.enchants[gearId] ? ENCHANT_BY_ID[s.gear.enchants[gearId]] : null;
    const pool = target === 'pan' ? PAN_ENCHANTS : SHOVEL_ENCHANTS;
    let html = `<div class="dialog" style="margin-bottom:10px"><div class="face" style="background:#4a4258">🔮</div><div class="say">The altar hums. Offer <b style="color:#7dffb2">Aurorite</b> or <b style="color:#d9c2ff">Aetherite</b> to imbue your equipped ${target} with a random enchantment. It replaces the current one.</div></div>`;
    html += `<div class="row equipped"><img class="ic" src="${target === 'pan' ? panIcon(gear) : shovelIcon(gear)}"><div class="grow"><div class="t">${esc(gear.name)}</div><div class="d">Current: ${cur ? `<b class="${cur.rainbow ? 'rainbow' : ''}" style="color:${cur.color}">${esc(cur.name)}</b> (${esc(enchantStats(cur.stats))})` : 'No enchantment'}</div></div></div>`;
    if (this.state.reveal) html += `<div class="enchant-reveal stroke ${this.state.reveal.rainbow ? 'rainbow' : ''}" style="color:${this.state.reveal.color}">✨ ${esc(this.state.reveal.name)} ✨<div class="d" style="font-size:14px">${esc(enchantStats(this.state.reveal.stats))}</div></div>`;
    for (const [mat, label] of [
      ['aurorite', 'Aurorite'],
      ['aetherite', 'Aetherite'],
    ]) {
      const have = inventoryCount(s, mat);
      const list = pool.filter((e) => e.pool === mat);
      const tw = list.reduce((a, e) => a + e.weight, 0);
      html += `<div class="sect">${label} enchants (you have ${have})</div>`;
      html += list.map((e) => `<div class="row" style="padding:6px 10px"><div class="grow"><b class="${e.rainbow ? 'rainbow' : ''}" style="color:${e.color}">${esc(e.name)}</b> <span class="d">${esc(enchantStats(e.stats))}</span></div><span class="pill">${((e.weight / tw) * 100).toFixed(1)}%</span></div>`).join('');
      html += `<button class="btn ${mat === 'aurorite' ? '' : 'purple'}" style="margin:6px 0 4px" data-a="enchant" data-m="${mat}" data-t="${target}" ${have ? '' : 'disabled'}>Offer ${label}</button>`;
    }
    return { title: '🔮 Mysterious Altar', tabs, html };
  }

  a_enchant(d) {
    const e = this.game.enchant(d.t, d.m);
    if (e) this.state.reveal = e;
    this.render(true);
  }

  // =====================================================================
  // NPC dialog (quests)
  // =====================================================================
  p_npc(npc) {
    const q = this.game.quests;
    const def = npc;
    let html = `<div class="dialog"><div class="face" style="background:${def.look.shirt}">${def.role === 'museum' ? '🏛️' : '🙂'}</div><div class="say">${esc(def.greet[Math.floor(Math.random() * def.greet.length)])}</div></div>`;
    let foot = '';
    const cur = q.npcQuest(def);
    if (cur) {
      const Q = QUESTS[cur.qid];
      html += `<div class="sect">${cur.st === 'available' ? 'New Quest' : 'Quest'}: ${esc(Q.name)}</div><div class="row"><div class="grow"><div class="t" style="font-size:15px">${esc(Q.text)}</div>${Q.hint ? `<div class="d">💡 ${esc(Q.hint)}</div>` : ''}${this.objectivesHtml(cur.qid)}<div class="d" style="margin-top:6px">Rewards: ${this.rewardText(Q.rewards)}</div></div></div>`;
      if (cur.st === 'available') foot += `<button class="btn gold" data-a="acceptQuest" data-q="${cur.qid}">Accept Quest</button>`;
      if (cur.st === 'ready') foot += `<button class="btn" data-a="turnIn" data-q="${cur.qid}">✅ Complete Quest</button>`;
      if (cur.st === 'active') foot += `<span class="pill">In progress…</span>`;
    } else if (def.quests?.length) {
      html += `<div class="d" style="margin-top:10px">You've done everything I asked. Thanks, partner!</div>`;
    }
    if (def.role === 'merchant') foot += `<button class="btn blue" data-a="open" data-p="merchant">💰 Sell minerals</button>`;
    if (def.role === 'museum') foot += `<button class="btn blue" data-a="open" data-p="museum">🏛️ Museum displays</button>`;
    if (def.role === 'anvil') foot += `<button class="btn blue" data-a="open" data-p="anvil">🔨 Forge</button>`;
    if (def.role === 'shards') foot += `<button class="btn purple" data-a="open" data-p="shards">🔭 Shard shop</button>`;
    if (def.shop && def.role === 'quest') foot += `<button class="btn blue" data-a="open" data-p="shop" data-arg="${def.shop}">🛒 Shop</button>`;
    return { title: `${esc(def.name)} <span class="pill">${esc(def.title)}</span>`, html, foot };
  }

  objectivesHtml(qid) {
    const Q = QUESTS[qid];
    const q = this.game.quests;
    return Q.objectives
      .map((o, i) => {
        const p = q.objectiveProgress(qid, i);
        const label = o.label || (o.type === 'deliver' ? `Deliver ${o.mineral ? MINERAL_BY_ID[o.mineral].name : TIERS[o.tier].name + ' mineral'}` : o.type === 'display' ? 'Museum displays' : o.type);
        return `<div class="d" style="margin-top:6px;color:${p >= o.n ? 'var(--money)' : '#dfe7ff'}">${p >= o.n ? '✅' : '▫️'} ${esc(label)} — ${fmtNum(p)}/${fmtNum(o.n)}</div><div class="prog"><i style="width:${Math.min(100, (p / o.n) * 100)}%"></i></div>`;
      })
      .join('');
  }

  rewardText(r) {
    const parts = [];
    if (r.money) parts.push(`<b style="color:var(--money)">${fmtMoney(r.money)}</b>`);
    if (r.shards) parts.push(`<b style="color:var(--shard)">◆ ${r.shards}</b>`);
    if (r.xp) parts.push(`${fmtNum(r.xp)} XP`);
    if (r.items) for (const [id, n] of Object.entries(r.items)) parts.push(`${n}x ${esc(CONSUMABLE_BY_ID[id].name)}`);
    if (r.rings) for (const [id, n] of Object.entries(r.rings)) parts.push(`${n}x ${esc(RING_BY_ID[id].name)}`);
    if (r.minerals) for (const [id, n] of Object.entries(r.minerals)) parts.push(`${n}x ${esc(MINERAL_BY_ID[id].name)}`);
    if (r.flags) parts.push('<b style="color:var(--gold)">Unlocks a new area!</b>');
    return parts.join(' • ');
  }

  a_acceptQuest(d) {
    this.game.quests.accept(d.q);
    this.render(true);
  }
  a_turnIn(d) {
    if (this.game.quests.turnIn(d.q)) this.render(true);
    else this.game.audio.play('error');
  }

  // =====================================================================
  // QUEST LOG + BOUNTIES
  // =====================================================================
  p_quests() {
    const s = this.save;
    const q = this.game.quests;
    let html = '<div class="sect">Active Quests</div>';
    const act = Object.keys(s.quests.active);
    if (!act.length) html += '<div class="d">No active quests. Look for NPCs with a <b style="color:var(--gold)">!</b> above their head.</div>';
    for (const qid of act) {
      const Q = QUESTS[qid];
      html += `<div class="row ${q.isComplete(qid) ? 'equipped' : ''}"><div class="grow"><div class="t">${esc(Q.name)} <span class="pill">${esc(this.game.npcName(Q.npc))}</span></div><div class="d">${esc(Q.text)}</div>${this.objectivesHtml(qid)}<div class="d" style="margin-top:4px">Rewards: ${this.rewardText(Q.rewards)}</div></div></div>`;
    }
    html += '<div class="sect">Available Quests</div>';
    const avail = Object.keys(QUESTS).filter((id) => q.status(id) === 'available');
    if (!avail.length) html += '<div class="d">None right now.</div>';
    for (const qid of avail) {
      const Q = QUESTS[qid];
      const npc = this.game.npcs.find((n) => n.def.id === Q.npc);
      html += `<div class="row"><div class="grow"><div class="t">${esc(Q.name)}</div><div class="d">Talk to <b>${esc(npc?.def.name || Q.npc)}</b> (${esc(this.game.world.areaAt(npc?.char.x || 0, npc?.char.z || 0).name)})</div></div></div>`;
    }
    html += `<div class="sect">Bounties</div>${this.bountiesHtml(false)}`;
    const done = Object.keys(s.quests.done).length;
    html += `<div class="sect">Completed: ${done} / ${Object.keys(QUESTS).length}</div>`;
    return { title: '📜 Quests', html };
  }

  bountiesHtml(atBoard) {
    const s = this.save;
    this.game.quests.ensureBounties();
    let html = '';
    for (const b of s.bounties.list) {
      html += `<div class="row ${b.done ? 'equipped' : ''}"><img class="ic" src="${emojiIcon('📋', '#5a3a1e')}"><div class="grow"><div class="t">${esc(b.label)}</div><div class="prog"><i style="width:${Math.min(100, (b.prog / b.n) * 100)}%"></i></div><div class="d">${fmtNum(b.prog)}/${fmtNum(b.n)} • Reward: ${this.rewardText(b.reward)}</div></div>${b.done ? (atBoard ? `<button class="btn gold" data-a="claimBounty" data-id="${b.id}">Claim</button>` : '<span class="pill">Claim at a board</span>') : ''}</div>`;
    }
    return html;
  }

  p_board() {
    let html = `<div class="dialog" style="margin-bottom:10px"><div class="face" style="background:#8a5a2b">📋</div><div class="say">Bounties refresh every day. Complete them anywhere, then claim rewards at any Notice Board.</div></div>`;
    html += this.bountiesHtml(true);
    return { title: '📋 Notice Board', html };
  }

  a_claimBounty(d) {
    this.game.quests.claimBounty(d.id);
    this.render(true);
  }

  // =====================================================================
  // INDEX (collection)
  // =====================================================================
  p_index() {
    const s = this.save;
    const disc = s.discovered.minerals;
    const n = Object.keys(disc).length;
    const site = this.game.currentSite || this.game.lastSite;
    const luck = this.game.stats.luck;
    let html = `<div class="row"><div class="grow"><div class="t">Discovered ${n} / ${MINERALS.length}</div><div class="d">${site ? `Chances shown for <b>${esc(SITES[site].name)}</b> at your Luck (${(Math.round(luck * 10) / 10).toFixed(1)}).` : 'Stand on (or dig at) a dig site to see your odds there.'}</div></div></div>`;
    const sel = this.state.indexSel;
    if (sel) {
      const m = MINERAL_BY_ID[sel];
      const d = disc[sel];
      const where = Object.entries(SITES)
        .filter(([, st]) => st.loot.some((l) => l.some(([id]) => id === sel)))
        .map(([, st]) => st.name);
      html += `<div class="row equipped"><img class="ic" src="${mineralIcon(sel)}"><div class="grow"><div class="t" style="color:${TIERS[m.tier].color}">${d ? esc(m.name) : '???'} <span class="pill">${TIERS[m.tier].name}</span></div><div class="d">${d ? esc(m.desc) : 'Not yet discovered.'}</div><div class="d">$${fmtNum(m.price)}/kg • Museum: ${STAT_NAMES[m.stat]}${d ? ` • Found ${d.n}x • Best ${fmtKg(d.best)}` : ''}</div><div class="d">Found at: ${esc(where.join(', ') || 'Unknown')}</div>${site && d ? `<div class="d">Chance here: <b>${chanceString(site, sel, luck) || 'not found here'}</b></div>` : ''}</div></div>`;
    }
    for (let t = 0; t < TIERS.length; t++) {
      html += `<div class="sect" style="color:${TIERS[t].color}">${TIERS[t].name}</div><div class="grid">`;
      for (const m of MINERALS.filter((x) => x.tier === t)) {
        const d = disc[m.id];
        const ch = site && d ? chanceString(site, m.id, luck) : null;
        html += `<div class="slot ${d ? '' : 'unknown'} ${sel === m.id ? 'sel' : ''}" style="--c:${d ? TIERS[t].color : 'rgba(255,255,255,.1)'}" data-a="indexSel" data-id="${m.id}"><img src="${mineralIcon(m.id)}"><div class="nm ${d && TIERS[t].rainbow ? 'rainbow' : ''}">${d ? esc(m.name) : '???'}</div><div class="kg">${d ? 'x' + d.n : ''}</div>${ch ? `<div class="v" style="color:var(--muted)">${ch}</div>` : ''}</div>`;
      }
      html += '</div>';
    }
    html += '<div class="sect">Modifiers</div><div class="kv">' + MODIFIERS.map((md) => `<div style="color:${md.color}">${esc(md.name)}</div><div>x${md.mult} value • museum ${STAT_NAMES[md.stat]}</div>`).join('') + '</div>';
    return { title: '📖 Mineral Index', html, wide: true };
  }

  a_indexSel(d) {
    this.state.indexSel = d.id;
    this.render(true);
  }

  // =====================================================================
  // MAP + FAST TRAVEL
  // =====================================================================
  p_map(travelMode) {
    const s = this.save;
    const g = this.game;
    this.afterRender = () => this.drawBigMap();
    const html = `<div class="mapwrap" id="bigmap"><canvas width="900" height="900"></canvas></div><div class="d" style="margin-top:8px;text-align:center">${travelMode ? 'Tap a discovered town (🏠) to fast travel.' : 'Find a 🧭 travel post in any town to fast travel. Numbers show dig site Toughness.'}</div>`;
    return { title: travelMode ? '🧭 Fast Travel' : '🗺️ Island Map', html };
  }

  drawBigMap() {
    const g = this.game;
    const wrap = $('#bigmap', this.root);
    if (!wrap) return;
    const cv = $('canvas', wrap);
    const ctx = cv.getContext('2d');
    const img = g.mapImage;
    ctx.drawImage(img, 0, 0, cv.width, cv.height);
    const half = g.world.half;
    const toPct = (x, z) => [((x + half) / (half * 2)) * 100, ((z + half) / (half * 2)) * 100];
    const travelMode = this.arg;
    let marks = '';
    // dig sites
    const seen = new Set();
    for (const ds of DIG_SITES) {
      if (seen.has(ds.id)) continue;
      seen.add(ds.id);
      const st = SITES[ds.id];
      const [px, pz] = toPct((ds.a[0] + ds.b[0]) / 2, (ds.a[1] + ds.b[1]) / 2);
      const ok = g.stats.toughness >= st.toughness;
      marks += `<div class="mapmark stroke" style="left:${px}%;top:${pz}%;color:${ok ? '#ffe08a' : '#ff9aa4'}"><span class="dot">⛏️</span>${esc(st.name)} (${st.toughness})</div>`;
    }
    for (const t of TOWNS) {
      const [px, pz] = toPct(t.x, t.z);
      const known = this.save.discovered.towns[t.id];
      marks += `<div class="mapmark town stroke ${known ? '' : 'locked'}" style="left:${px}%;top:${pz - 3}%" ${known && travelMode ? `data-a="travel" data-t="${t.id}"` : ''}><span class="dot">${known ? '🏠' : '❔'}</span>${known ? esc(t.name) : '???'}</div>`;
    }
    const ev = g.events;
    for (const c of ev.craters) {
      const [px, pz] = toPct(c.x, c.z);
      marks += `<div class="mapmark" style="left:${px}%;top:${pz}%"><span class="dot">☄️</span></div>`;
    }
    if (ev.rift) {
      const [px, pz] = toPct(ev.rift.x, ev.rift.z);
      marks += `<div class="mapmark stroke" style="left:${px}%;top:${pz}%;color:#d9a8ff"><span class="dot">🌀</span>Rift</div>`;
    }
    for (const sl of this.save.sluices) {
      const [px, pz] = toPct(sl.x, sl.z);
      marks += `<div class="mapmark" style="left:${px}%;top:${pz}%"><span class="dot">🪵</span></div>`;
    }
    const p = g.player.pos;
    const [px, pz] = toPct(p.x, p.z);
    marks += `<div class="mapmark stroke" style="left:${px}%;top:${pz}%;z-index:2"><span class="dot" style="transform:rotate(${-g.player.yaw + Math.PI}rad)">⬆️</span>You</div>`;
    wrap.insertAdjacentHTML('beforeend', marks);
  }

  a_travel(d) {
    const t = TOWNS.find((x) => x.id === d.t);
    if (!t) return;
    this.close();
    this.game.teleport(t.travel[0], t.travel[1]);
  }

  // =====================================================================
  // AVATAR
  // =====================================================================
  p_avatar() {
    const L = this.save.look;
    const opts = {
      shirt: ['#3a86ff', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#e67e22', '#1abc9c', '#ff6b9a', '#ffffff', '#222222', '#8d6e63', '#00bcd4'],
      pants: ['#2b2d42', '#34495e', '#5d4037', '#1a1a2e', '#2d3436', '#0c2461', '#6d4c41', '#4a4a4a', '#7f8c8d', '#1e5c3a'],
      skin: ['#f2c49b', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#f1c27d', '#a8754f', '#ffe0bd', '#9fe3a0', '#ffd23f'],
      hatColor: ['#8a5a2b', '#2d6aa8', '#c0392b', '#222222', '#f1c40f', '#ffffff', '#6c3fd1', '#16a085', '#e17055'],
    };
    let html = '';
    for (const [k, list] of Object.entries(opts)) {
      html += `<div class="sect">${k === 'hatColor' ? 'Hat color' : k}</div><div style="display:flex;gap:6px;flex-wrap:wrap">${list.map((c) => `<button data-a="look" data-k="${k}" data-v="${c}" style="width:38px;height:38px;border-radius:10px;border:3px solid ${L[k] === c ? '#fff' : 'transparent'};background:${c};cursor:pointer"></button>`).join('')}</div>`;
    }
    html += `<div class="sect">Hat</div><div class="seg">${['cowboy', 'cap', 'miner', 'beanie', 'tophat', 'hood', 'none'].map((h) => `<button class="${(L.hat || 'none') === h ? 'on' : ''}" data-a="look" data-k="hat" data-v="${h}">${h}</button>`).join('')}</div>`;
    html += `<div class="sect">Face</div><div class="seg">${['😊 Smile', '😁 Grin', '😠 Determined', '😄 Happy'].map((f, i) => `<button class="${L.face === i ? 'on' : ''}" data-a="look" data-k="face" data-v="${i}">${f}</button>`).join('')}</div>`;
    html += `<div class="sect">Name</div><input class="namebox" id="nameInput" maxlength="18" value="${esc(this.save.name)}"><button class="btn small" style="margin-top:6px" data-a="setName">Save name</button>`;
    return { title: '🧑‍🌾 Customize', html };
  }

  a_look(d) {
    const L = this.save.look;
    if (d.k === 'face') L.face = +d.v;
    else if (d.k === 'hat') L.hat = d.v === 'none' ? null : d.v;
    else L[d.k] = d.v;
    this.game.applyLook();
    this.render(true);
  }
  a_setName() {
    const v = $('#nameInput', this.root).value.trim();
    if (v) this.save.name = v.slice(0, 18);
    this.game.hud.toast('Name saved!');
  }

  // =====================================================================
  // MENU / SETTINGS
  // =====================================================================
  p_menu() {
    const tab = this.state.menuTab || 'settings';
    const tabs = this.tabs(
      [
        ['settings', '⚙️ Settings'],
        ['graphics', '🖥️ Graphics'],
        ['save', '💾 Save'],
        ['help', '❓ How to play'],
      ],
      tab,
      'menuTab',
    );
    const S = this.game.settings;
    let html = '';
    const seg = (key, list) => `<div class="seg">${list.map(([v, l]) => `<button class="${String(S[key]) === String(v) ? 'on' : ''}" data-a="setSeg" data-k="${key}" data-v="${v}">${l}</button>`).join('')}</div>`;
    const range = (key, min, max, step) => `<input type="range" min="${min}" max="${max}" step="${step}" value="${S[key]}" data-set="${key}">`;
    const check = (key) => `<input type="checkbox" ${S[key] ? 'checked' : ''} data-set="${key}" style="width:22px;height:22px">`;
    if (tab === 'settings') {
      html += `<div class="settings-row">Sound effects ${range('sfxVolume', 0, 1, 0.05)}</div>`;
      html += `<div class="settings-row">Ambience ${range('ambVolume', 0, 1, 0.05)}</div>`;
      html += `<div class="settings-row">Music ${range('musicVolume', 0, 1, 0.05)}</div>`;
      html += `<div class="settings-row">Mute all ${check('muted')}</div>`;
      html += `<div class="settings-row">Camera auto-follow ${check('autoCamera')}</div>`;
      html += `<div class="settings-row">Day length ${seg('dayScale', [
        [0.5, 'Long'],
        [1, 'Normal'],
        [2, 'Short'],
      ])}</div>`;
      html += `<div class="settings-row">Show FPS / renderer stats ${check('showFps')}</div>`;
      html += `<div class="settings-row">Auto-sell Commons when panning ${check('autoSellCommon')}</div>`;
    } else if (tab === 'graphics') {
      const g = this.game;
      html += `<div class="row"><div class="grow"><div class="t">Renderer: ${esc(g.backendLabel)}</div><div class="d">${esc(g.gpuName || '')}<br>${g.backendName === 'WebGPU' ? (g.metal ? 'WebGPU runs natively on Apple Metal on this device.' : 'WebGPU (native GPU API).') : 'WebGL2 fallback (Safari runs it on Metal via ANGLE).'} Single-pass forward rendering straight to the drawable, MSAA resolved on-tile, instanced draws, GPU-animated particles.</div></div></div>`;
      html += `<div class="settings-row">Quality preset ${seg(
        'quality',
        Object.entries(QUALITY_PRESETS).map(([k, v]) => [k, v.label]),
      )}</div>`;
      html += `<div class="settings-row">Graphics API (reload) ${seg('backend', [
        ['auto', 'Auto (WebGPU/Metal)'],
        ['webgl', 'WebGL2'],
      ])}</div>`;
      html += `<div class="settings-row">Render scale ${range('renderScale', 0.5, 1, 0.05)}</div>`;
      html += `<div class="settings-row">Dynamic resolution ${check('dynamicRes')}</div>`;
      html += `<div class="settings-row">Frame rate cap ${seg('fpsCap', [
        [30, '30'],
        [60, '60'],
        [0, 'Max (ProMotion)'],
      ])}</div>`;
      html += `<div class="settings-row">View distance ${range('viewScale', 0.6, 1.4, 0.05)}</div>`;
      html += `<div class="d" style="margin-top:8px">Changing quality or API reloads the game (your progress is saved first).</div>`;
    } else if (tab === 'save') {
      const s = this.save;
      html += `<div class="row"><div class="grow"><div class="t">Slot ${this.game.slot + 1}: ${esc(s.name)}</div><div class="d">Autosaves every 20 seconds and when you leave. Play time ${fmtTime(s.playTime)}.</div></div><button class="btn" data-a="saveNow">💾 Save now</button></div>`;
      html += `<div class="sect">Export / Import</div><div class="d">Copy this code to back up your save or move it to another device.</div><textarea class="savebox" id="saveBox" readonly>${esc(this.game.saves.exportString(this.game.save))}</textarea><div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap"><button class="btn small blue" data-a="copySave">📋 Copy</button><button class="btn small gray" data-a="downloadSave">⬇️ Download file</button></div>`;
      html += `<div class="sect">Import into this slot</div><textarea class="savebox" id="importBox" placeholder="Paste a save code here"></textarea><button class="btn small red" style="margin-top:6px" data-a="importSave">Import (overwrites this slot)</button>`;
      html += `<div class="sect">Leave</div><button class="btn gray" data-a="quitTitle">🏠 Save & quit to title</button>`;
    } else {
      html += `<div class="say" style="font-size:15px;line-height:1.6"><b>⛏️ Dig:</b> Stand on a sandy dig site and hold <b>left click</b> / the <b>Dig</b> button. Release when the needle is in the <b style="color:#5fe36a">green zone</b> for a Perfect Dig (more dirt). Each site has a <b>Toughness</b>: your shovel must be at least that tough.<br><b>🍳 Pan:</b> Walk into water with dirt in your pan and hold to shake. When the sediment washes out you get minerals!<br><b>💰 Sell</b> to merchants, <b>🛒 upgrade</b> pans (Luck, Capacity) and shovels (Strength, Toughness), and unlock harder sands with rarer minerals.<br><b>🏛️ Museum:</b> display one of each mineral for permanent boosts. <b>🔨 Rings</b> and <b>🔮 enchants</b> add more stats.<br><b>☄️ Events:</b> watch for Meteor Showers, Solar Flares, Rifts and local weather. <b>🥶 Cold</b> places freeze you; stand by campfires. <b>🔥 Lava</b> burns!<br><b>Controls:</b> WASD/arrows move, Space jump, Shift sprint, E interact, right-drag or 2-finger swipe to turn the camera, scroll/pinch to zoom, I bag, J quests, C index, M map, Esc menu.</div>`;
    }
    return { title: '⚙️ Menu', tabs, html };
  }

  a_setSeg(d) {
    let v = d.v;
    if (d.k === 'fpsCap' || d.k === 'dayScale') v = parseFloat(v);
    this.setSetting(d.k, v);
    this.render(true);
  }

  setSetting(k, v, live) {
    const g = this.game;
    const old = g.settings[k];
    g.settings[k] = v;
    g.saveSettings();
    if ((k === 'quality' || k === 'backend') && old !== v) {
      g.reloadForSettings();
      return;
    }
    g.applySettings(k);
  }

  a_saveNow() {
    this.game.saveGame(true);
  }
  a_copySave() {
    const t = $('#saveBox', this.root);
    t.select();
    try {
      navigator.clipboard?.writeText(t.value);
    } catch (e) {
      document.execCommand('copy');
    }
    this.game.hud.toast('Save code copied!');
  }
  a_downloadSave() {
    const blob = new Blob([this.game.saves.exportString(this.game.save)], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `prospect-save-${this.game.save.name.replace(/\W+/g, '_')}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  a_importSave() {
    const v = $('#importBox', this.root).value.trim();
    const s = this.game.saves.importString(v);
    if (!s) return this.game.hud.toast('That save code is not valid.', 'bad');
    this.game.saves.write(this.game.slot, s);
    location.reload();
  }
  a_quitTitle() {
    this.game.saveGame();
    location.href = location.pathname;
  }

  // ---------- passthroughs for HUD notifications ----------
  toast(t, k) {
    this.game.hud.toast(t, k);
  }
  floatText(t, c) {
    this.game.hud.floatText(t, c);
  }
  bubble(c, t) {
    this.game.hud.bubble(c, t);
  }
  questComplete(q) {
    this.game.hud.floatText('QUEST COMPLETE!', '#ffd23f');
    this.game.hud.toast(`🏆 ${q.name} complete! ${q.done || ''}`, 'quest', 5);
  }
  eventStarted(id, d) {
    const g = this.game;
    const area = g.currentArea?.id;
    const relevant = d.global || d.regions?.includes(area);
    if (relevant) g.hud.floatText(`${d.icon} ${d.name.toUpperCase()}!`, d.color, 30);
    g.chat.system(`${d.icon} ${d.name}${d.global ? '' : ' in ' + (d.regions || []).map((r) => g.areaName(r)).filter(Boolean).slice(0, 2).join(' & ')}! ${d.desc}`);
    g.bots?.reactToEvent();
  }
  eventEnded(id, d) {
    this.game.chat.system(`${d.icon} The ${d.name} has ended.`);
  }
}
