// HUD: currencies, level, area banner, events, minimap, status effects, pan bar, dig meter,
// toasts, find cards, chat, name tags / speech bubbles, touch controls.
import * as THREE from 'three/webgpu';
import { MINERAL_BY_ID, TIERS, MODIFIER_BY_ID } from '../data/minerals.js';
import { STATUS_DEFS } from '../game/status.js';
import { EVENT_DEFS } from '../game/events.js';
import { mineralIcon } from './icons.js';
import { TOWNS } from '../data/places.js';
import { fmtMoney, fmtNum, fmtKg, esc } from './format.js';

const $ = (sel, root = document) => root.querySelector(sel);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export class Chat {
  constructor(root) {
    this.root = root;
    this.lines = [];
  }

  push(html, cls = '') {
    const l = el('div', 'chatline ' + cls, html);
    this.root.appendChild(l);
    while (this.root.children.length > 8) this.root.firstChild.remove();
  }

  say(name, text, color = '#fff') {
    this.push(`<b style="color:${color}">${esc(name)}:</b> ${esc(text)}`);
  }

  system(text) {
    this.push(esc(text), 'sys');
  }

  global(text, color) {
    this.push(`<b style="color:#ffd23f">[Global]</b> <span style="color:${color}">${esc(text)}</span>`, 'glob');
  }
}

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = $('#hud');
    this.root.innerHTML = `
      <div class="hud-tl">
        <div class="cur money stroke"><span class="ic">$</span><span id="h-money">0</span></div>
        <div class="cur shards stroke"><span class="ic">◆</span><span id="h-shards">0</span></div>
        <div class="lvl"><div class="badge" id="h-lvl">1</div><div class="bar"><i id="h-xp"></i></div></div>
      </div>
      <div class="hud-top">
        <div class="area-banner stroke" id="h-area"></div>
        <div class="events" id="h-events"></div>
      </div>
      <div class="hud-tr">
        <div class="minimap-wrap" id="h-minimap"><canvas width="220" height="220"></canvas></div>
        <div style="display:flex;gap:6px"><button class="clock stroke" id="h-lbbtn" title="Players (Tab)" style="border:0;cursor:pointer;color:#fff">👥 <span id="h-pc">1</span></button><div class="clock stroke" id="h-clock"></div></div>
        <div class="leaderboard hidden" id="h-lb"></div>
        <div class="fps hidden" id="h-fps"></div>
        <div class="status-row" id="h-status"></div>
      </div>
      <div class="hud-left">
        <button class="mbtn" data-p="inventory" title="Inventory (I)">🎒<span class="lbl stroke">Bag</span></button>
        <button class="mbtn" data-p="quests" title="Quests (J)">📜<span class="lbl stroke">Quests</span><span class="dot hidden" id="h-qdot">!</span></button>
        <button class="mbtn" data-p="index" title="Collection (C)">📖<span class="lbl stroke">Index</span></button>
        <button class="mbtn" data-p="map" title="Map (M)">🗺️<span class="lbl stroke">Map</span></button>
        <button class="mbtn" data-p="menu" title="Menu (Esc)">⚙️<span class="lbl stroke">Menu</span></button>
      </div>
      <div class="hud-bottom">
        <div class="prompt hidden" id="h-prompt"></div>
        <div class="hint stroke" id="h-hint"></div>
        <div class="panbar"><span class="pi" id="h-tool">⛏️</span><div class="track"><div class="fill" id="h-panfill"></div></div><span class="txt stroke" id="h-pantxt">0/5</span></div>
      </div>
      <div class="meter hidden" id="h-meter"><div class="lab stroke" id="h-meterlab">DIG!</div><div class="track"><div class="fillbar" id="h-mfill"></div><div class="zone" id="h-zone"></div><div class="needle" id="h-needle"></div></div></div>
      <div class="shakeprog hidden" id="h-shake"><div class="lab stroke" style="text-align:center;font-weight:900;margin-bottom:4px">Shaking...</div><div class="track"><div class="fill" id="h-shakefill"></div></div></div>
      <div id="toasts"></div>
      <div id="finds"></div>
      <div id="chat"></div>
      <div id="touch" class="hidden">
        <div class="joy-base" id="joy"><div class="joy-knob"></div></div>
        <div class="tbtn action" id="t-action">⛏️<small>DIG</small></div>
        <div class="tbtn jump" id="t-jump">⤒</div>
        <div class="tbtn interact hidden" id="t-interact">💬</div>
      </div>`;
    this.chat = new Chat($('#chat'));
    this.els = {
      money: $('#h-money'),
      shards: $('#h-shards'),
      lvl: $('#h-lvl'),
      xp: $('#h-xp'),
      area: $('#h-area'),
      events: $('#h-events'),
      clock: $('#h-clock'),
      fps: $('#h-fps'),
      status: $('#h-status'),
      prompt: $('#h-prompt'),
      hint: $('#h-hint'),
      tool: $('#h-tool'),
      panfill: $('#h-panfill'),
      pantxt: $('#h-pantxt'),
      meter: $('#h-meter'),
      meterlab: $('#h-meterlab'),
      mfill: $('#h-mfill'),
      zone: $('#h-zone'),
      needle: $('#h-needle'),
      shake: $('#h-shake'),
      shakefill: $('#h-shakefill'),
      toasts: $('#toasts'),
      finds: $('#finds'),
      qdot: $('#h-qdot'),
      minimap: $('#h-minimap canvas'),
      tAction: $('#t-action'),
      tInteract: $('#t-interact'),
    };
    this.labelsRoot = $('#labels');
    this.labelPool = [];
    this.bubbles = [];
    this.last = {};
    this.root.querySelectorAll('.mbtn').forEach((b) =>
      b.addEventListener('click', () => {
        game.audio.unlock();
        game.audio.play('ui');
        game.ui.open(b.dataset.p);
      }),
    );
    $('#h-minimap').addEventListener('click', () => game.ui.open('map'));
    $('#h-lbbtn').addEventListener('click', () => this.toggleLeaderboard());
    this.els.prompt.addEventListener('click', () => game.interact());
    this.setupTouch();
    this.mmCtx = this.els.minimap.getContext('2d');
    this.mmTimer = 0;
    this.v = new THREE.Vector3();
  }

  setupTouch() {
    const g = this.game;
    if (!g.input.touch) return;
    document.body.classList.add('touch');
    $('#touch').classList.remove('hidden');
    g.input.setJoystickEls($('#joy'), $('#joy .joy-knob'));
    const act = this.els.tAction;
    const down = (e) => {
      e.preventDefault();
      g.audio.unlock();
      g.input.touchAction = true;
      act.classList.add('on');
    };
    const up = (e) => {
      e.preventDefault();
      g.input.touchAction = false;
      act.classList.remove('on');
    };
    act.addEventListener('touchstart', down, { passive: false });
    act.addEventListener('touchend', up, { passive: false });
    act.addEventListener('touchcancel', up, { passive: false });
    const jump = $('#t-jump');
    jump.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        g.input.jumpPressed = true;
      },
      { passive: false },
    );
    this.els.tInteract.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        g.interact();
      },
      { passive: false },
    );
  }

  toggleLeaderboard(force) {
    this.lbOpen = force ?? !this.lbOpen;
    $('#h-lb').classList.toggle('hidden', !this.lbOpen);
    this.drawLeaderboard();
  }

  drawLeaderboard() {
    if (!this.lbOpen) return;
    const g = this.game;
    const rows = g.bots.bots.map((b) => ({ name: b.name, money: b.money, level: b.level, me: false }));
    rows.push({ name: g.save.name, money: g.save.money, level: g.save.level, me: true });
    rows.sort((a, b) => b.money - a.money);
    const html = `<div class="lb-head"><span>Player</span><span>Lvl</span><span>Money</span></div>` + rows.map((r) => `<div class="lb-row ${r.me ? 'me' : ''}"><span>${esc(r.name)}</span><span>${r.level}</span><span>${fmtMoney(r.money)}</span></div>`).join('');
    $('#h-lb').innerHTML = html;
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
  }

  // ---------- notifications ----------
  toast(text, kind = '', dur = 3.2) {
    const t = el('div', 'toast ' + kind, esc(text));
    t.style.setProperty('--d', dur + 's');
    this.els.toasts.appendChild(t);
    setTimeout(() => t.remove(), (dur + 0.5) * 1000);
    while (this.els.toasts.children.length > 4) this.els.toasts.firstChild.remove();
  }

  floatText(text, color = '#fff', size) {
    const t = el('div', 'float-text stroke', esc(text));
    t.style.color = color;
    if (size) t.style.fontSize = size + 'px';
    this.root.appendChild(t);
    setTimeout(() => t.remove(), 1200);
  }

  moneyPop(amount) {
    const t = el('div', 'money-pop stroke', '+' + fmtMoney(amount));
    $('.hud-tl', this.root).appendChild(t);
    setTimeout(() => t.remove(), 1300);
  }

  findCard(item, value) {
    const m = MINERAL_BY_ID[item.id];
    const tier = TIERS[m.tier];
    const mods = (item.mods || []).map((x) => MODIFIER_BY_ID[x].name).join(' ');
    const c = el('div', 'find');
    c.style.setProperty('--c', tier.color);
    c.style.setProperty('--d', m.tier >= 3 ? '6s' : '3.6s');
    c.innerHTML = `<img src="${mineralIcon(item.id, item.mods)}"><div><div class="nm ${tier.rainbow ? 'rainbow' : ''}">${mods ? esc(mods) + ' ' : ''}${esc(m.name)}</div><div class="sub">${tier.name} • ${fmtKg(item.kg)}${item.huge ? ' • HUGE!' : ''}</div></div><div class="val">${fmtMoney(value)}</div>`;
    this.els.finds.appendChild(c);
    setTimeout(() => c.remove(), m.tier >= 3 ? 6600 : 4200);
    while (this.els.finds.children.length > 6) this.els.finds.firstChild.remove();
  }

  bigFind(item, value) {
    const m = MINERAL_BY_ID[item.id];
    const tier = TIERS[m.tier];
    const mods = (item.mods || []).map((x) => MODIFIER_BY_ID[x].name).join(' ');
    const w = el('div', 'bigfind');
    w.innerHTML = `<div class="card" style="--c:${tier.color}"><div class="tier stroke ${tier.rainbow ? 'rainbow' : ''}" style="color:${tier.color}">✦ ${tier.name.toUpperCase()} FIND ✦</div><img src="${mineralIcon(item.id, item.mods)}"><div class="nm stroke ${tier.rainbow ? 'rainbow' : ''}" style="color:${tier.color}">${mods ? esc(mods) + ' ' : ''}${esc(m.name)}</div><div class="sub stroke">${fmtKg(item.kg)} • worth ${fmtMoney(value)}</div></div>`;
    this.root.appendChild(w);
    const f = el('div', 'flash');
    f.style.background = `radial-gradient(circle, ${tier.glow}aa, transparent 70%)`;
    this.root.appendChild(f);
    setTimeout(() => f.remove(), 900);
    setTimeout(() => w.remove(), 4200);
  }

  bubble(char, text) {
    this.bubbles.push({ char, text, t: 5 });
  }

  // ---------- per-frame ----------
  update(dt) {
    const g = this.game;
    const s = g.save;
    const E = this.els;
    const L = this.last;
    if (L.money !== s.money) {
      E.money.textContent = fmtNum(s.money);
      L.money = s.money;
    }
    if (L.shards !== s.shards) {
      E.shards.textContent = fmtNum(s.shards);
      L.shards = s.shards;
    }
    if (L.lvl !== s.level || L.xp !== s.xp) {
      E.lvl.textContent = s.level;
      E.xp.style.width = Math.min(100, (s.xp / g.xpNeeded()) * 100) + '%';
      L.lvl = s.level;
      L.xp = s.xp;
    }
    // pan bar
    const st = g.stats;
    const fill = s.pan.fill;
    const pct = Math.min(100, (fill / st.capacity) * 100);
    const ptxt = `${fmtNum(Math.floor(fill * 10) / 10)}/${fmtNum(st.capacity)}`;
    if (L.ptxt !== ptxt) {
      E.panfill.style.width = pct + '%';
      E.panfill.classList.toggle('full', fill >= st.capacity - 0.01);
      E.pantxt.textContent = ptxt;
      L.ptxt = ptxt;
    }
    const tool = g.player.char.tool === 'pan' ? '🍳' : '⛏️';
    if (L.tool !== tool) {
      E.tool.textContent = tool;
      L.tool = tool;
    }
    // hint
    const hint = g.contextHint || '';
    if (L.hint !== hint) {
      E.hint.textContent = hint;
      E.hint.className = 'hint stroke' + (g.contextBad ? ' bad' : '');
      L.hint = hint;
    }
    // touch action label
    if (g.input.touch) {
      const lab = g.actionMode === 'shake' ? '🍳<small>PAN</small>' : g.actionMode === 'dig' ? '⛏️<small>DIG</small>' : '✋<small>—</small>';
      if (L.tlab !== lab) {
        E.tAction.innerHTML = lab;
        L.tlab = lab;
      }
    }
    // prompt
    const it = g.interactTarget;
    const ptext = it ? (g.input.touch ? '' : '<kbd>E</kbd> ') + esc(it.label) : '';
    if (L.prompt !== ptext) {
      E.prompt.innerHTML = ptext;
      E.prompt.classList.toggle('hidden', !it);
      E.tInteract.classList.toggle('hidden', !it);
      L.prompt = ptext;
    }
    // meter / shake progress
    const a = g.action;
    if (a && a.type === 'dig' && a.charging) {
      E.meter.classList.remove('hidden');
      const z = g.perfectZone();
      E.zone.style.left = z[0] * 100 + '%';
      E.zone.style.width = (z[1] - z[0]) * 100 + '%';
      E.needle.style.left = a.v * 100 + '%';
      E.mfill.style.width = a.v * 100 + '%';
      E.meterlab.textContent = 'Release in the green!';
    } else E.meter.classList.add('hidden');
    if (a && a.type === 'shake') {
      E.shake.classList.remove('hidden');
      E.shakefill.style.width = Math.min(100, (a.progress / Math.max(0.01, a.total)) * 100) + '%';
    } else E.shake.classList.add('hidden');

    // clock & area (throttled)
    this.slowT = (this.slowT || 0) - dt;
    if (this.slowT <= 0) {
      this.slowT = 0.25;
      const h = g.env.hour;
      const hh = Math.floor(h),
        mm = Math.floor((h - hh) * 60);
      const icon = g.env.isNight ? '🌙' : h < 8 ? '🌅' : h > 17 ? '🌇' : '☀️';
      E.clock.textContent = `${icon} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      this.updateStatus();
      this.updateEvents();
      E.qdot.classList.toggle('hidden', !g.hasQuestAttention());
      $('#h-pc').textContent = g.bots.bots.length + 1;
      if (this.lbOpen && (this.lbT = (this.lbT || 0) + 1) % 8 === 0) this.drawLeaderboard();
      if (g.settings.showFps) {
        E.fps.classList.remove('hidden');
        const info = g.renderer.info.render;
        E.fps.textContent = `${g.fps.toFixed(0)} fps  ${g.backendLabel}\n${info.drawCalls} draws  ${(info.triangles / 1000).toFixed(0)}k tris  x${g.res.scale.toFixed(2)}`;
      } else E.fps.classList.add('hidden');
    }
    this.mmTimer -= dt;
    if (this.mmTimer <= 0) {
      this.mmTimer = 0.1;
      this.drawMinimap();
    }
    this.updateLabels(dt);
  }

  showArea(area) {
    const E = this.els;
    const site = this.game.currentSiteName;
    E.area.innerHTML = `<span style="color:${area.color}">${esc(area.name)}</span>${site ? `<small>${esc(site)}</small>` : ''}`;
    E.area.classList.add('show');
    clearTimeout(this.areaT);
    this.areaT = setTimeout(() => E.area.classList.remove('show'), 3500);
  }

  updateEvents() {
    const g = this.game;
    const area = g.currentArea?.id;
    const ids = g.events.activeFor(area);
    const parts = ids.map((id) => {
      const d = EVENT_DEFS[id];
      const a = g.events.active[id];
      const left = Math.max(0, Math.ceil(a.dur - a.t));
      return `<div class="event-pill stroke" style="--c:${d.color}" title="${esc(d.desc)}">${d.icon} ${esc(d.name)} <span class="t">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span></div>`;
    });
    if (['infernal', 'caldera', 'furnace'].includes(area) && g.save.flags.infernal_access) {
      const r = Math.ceil(g.events.infernalRemaining);
      parts.push(`<div class="event-pill stroke" style="--c:#ff4a1c">🔥 Heart ${g.events.infernalAwake ? 'AWAKE' : 'dormant'} <span class="t">${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}</span></div>`);
    }
    const html = parts.join('');
    if (this.last.events !== html) {
      this.els.events.innerHTML = html;
      this.last.events = html;
    }
  }

  updateStatus() {
    const g = this.game;
    const parts = [];
    for (const [id, s] of Object.entries(g.status.list)) {
      const d = STATUS_DEFS[id];
      if (!d) continue;
      const tm = s.t > 0 && s.t < 9999 && !['warm', 'luck_totem', 'strength_totem', 'meteor_totem', 'sandblind', 'voidtouched'].includes(id) ? `<span class="tm">${Math.ceil(s.t)}s</span>` : '';
      parts.push(`<div class="status stroke ${d.bad ? 'bad' : ''}" title="${esc(d.desc)}"><span class="i">${d.icon}</span>${esc(d.name)}${tm}</div>`);
    }
    for (const e of g.save.effects) {
      const c = g.consumable(e.id);
      const left = Math.max(0, Math.ceil(e.left));
      parts.push(`<div class="status stroke" title="${esc(c.desc)}"><span class="i">🧪</span>${esc(c.name)}<span class="tm">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span></div>`);
    }
    if (g.status.cold > 1) parts.push(`<div class="status stroke ${g.status.cold > 35 ? 'bad' : ''}"><span class="i">🌡️</span><div class="coldbar"><i style="width:${g.status.cold}%"></i></div></div>`);
    const html = parts.join('');
    if (this.last.status !== html) {
      this.els.status.innerHTML = html;
      this.last.status = html;
    }
  }

  // ---------- minimap ----------
  drawMinimap() {
    const g = this.game;
    const img = g.mapImage;
    if (!img) return;
    const ctx = this.mmCtx;
    const W = 220;
    const p = g.player.pos;
    const range = 260; // meters across
    const scale = W / range;
    const mapScale = img.width / (g.world.half * 2);
    ctx.save();
    ctx.fillStyle = '#2a5a8a';
    ctx.fillRect(0, 0, W, W);
    ctx.translate(W / 2, W / 2);
    ctx.rotate(g.player.camYaw);
    ctx.scale(scale / mapScale, scale / mapScale);
    ctx.drawImage(img, -(p.x + g.world.half) * mapScale, -(p.z + g.world.half) * mapScale);
    ctx.restore();
    // markers
    const rot = g.player.camYaw;
    const cs = Math.cos(rot),
      sn = Math.sin(rot);
    const toMM = (x, z) => {
      const dx = (x - p.x) * scale,
        dz = (z - p.z) * scale;
      return [W / 2 + dx * cs - dz * sn, W / 2 + dx * sn + dz * cs];
    };
    ctx.font = '900 16px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const inR = (mx, my) => Math.hypot(mx - W / 2, my - W / 2) < W / 2 - 8;
    for (const n of g.npcs) {
      const [mx, my] = toMM(n.char.x, n.char.z);
      if (!inR(mx, my)) continue;
      const q = g.quests.npcQuest(n.def);
      if (q && (q.st === 'available' || q.st === 'ready')) {
        ctx.fillStyle = q.st === 'ready' ? '#5fe36a' : '#ffd23f';
        ctx.fillText(q.st === 'ready' ? '?' : '!', mx, my);
      } else {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(mx, my, 3, 0, 7);
        ctx.fill();
      }
    }
    ctx.fillStyle = '#ffd23f';
    for (const b of g.bots.bots) {
      const [mx, my] = toMM(b.char.x, b.char.z);
      if (!inR(mx, my)) continue;
      ctx.fillStyle = '#9fd8ff';
      ctx.beginPath();
      ctx.arc(mx, my, 2.2, 0, 7);
      ctx.fill();
    }
    const ev = g.events;
    for (const c of ev.craters) {
      const [mx, my] = toMM(c.x, c.z);
      ctx.fillText('☄️', mx, my);
    }
    for (const f of ev.flares) {
      const [mx, my] = toMM(f.x, f.z);
      ctx.fillText('☀️', mx, my);
    }
    if (ev.rift) {
      const [mx, my] = toMM(ev.rift.x, ev.rift.z);
      ctx.fillText('🌀', mx, my);
    }
    for (const t of TOWNS) {
      const [mx, my] = toMM(t.x, t.z);
      if (!inR(mx, my)) continue;
      ctx.font = '900 13px system-ui';
      ctx.fillText('🏠', mx, my);
    }
    // player arrow (always up = camera forward)
    ctx.save();
    ctx.translate(W / 2, W / 2);
    ctx.rotate(-(g.player.yaw - (g.player.camYaw + Math.PI)));
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // N indicator
    const [nx, ny] = [W / 2 + Math.sin(-rot) * -(W / 2 - 14), W / 2 + Math.cos(-rot) * -(W / 2 - 14)];
    ctx.font = '900 14px system-ui';
    ctx.fillStyle = '#ff5a6a';
    ctx.fillText('N', nx, ny);
  }

  // ---------- name tags & bubbles ----------
  updateLabels(dt) {
    const g = this.game;
    const cam = g.camera;
    const W = window.innerWidth,
      H = window.innerHeight;
    let used = 0;
    const take = () => {
      let e = this.labelPool[used];
      if (!e) {
        e = el('div', 'nametag stroke');
        this.labelsRoot.appendChild(e);
        this.labelPool.push(e);
      }
      used++;
      e.style.display = '';
      return e;
    };
    const v = this.v;
    const project = (c, yOff = 0) => {
      if (!c.headWorld) return null;
      v.copy(c.headWorld);
      v.y += yOff;
      const d = v.distanceTo(cam.position);
      v.project(cam);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) return null;
      return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H, d };
    };
    // NPCs
    for (const n of g.npcs) {
      const s = project(n.char);
      if (!s || s.d > 38) continue;
      const q = g.quests.npcQuest(n.def);
      const mark = q && (q.st === 'available' || q.st === 'ready') ? `<span class="q" style="color:${q.st === 'ready' ? '#5fe36a' : '#ffd23f'}">${q.st === 'ready' ? '?' : '!'}</span>` : '';
      const html = `${mark}${esc(n.def.name)}<span class="ttl">${esc(n.def.title)}</span>`;
      const e = take();
      if (e._html !== html) {
        e.innerHTML = html;
        e._html = html;
      }
      e.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%,-100%)`;
      e.style.opacity = s.d > 30 ? (38 - s.d) / 8 : 1;
    }
    // bots
    for (const b of g.bots.bots) {
      const s = project(b.char);
      if (!s || s.d > 30) continue;
      const e = take();
      const html = esc(b.name);
      if (e._html !== html) {
        e.innerHTML = html;
        e._html = html;
      }
      e.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%,-100%)`;
      e.style.opacity = s.d > 22 ? (30 - s.d) / 8 : 0.9;
    }
    for (let i = used; i < this.labelPool.length; i++) this.labelPool[i].style.display = 'none';
    // bubbles
    this.bubbles = this.bubbles.filter((b) => {
      b.t -= dt;
      if (!b.el) {
        b.el = el('div', 'bubble', esc(b.text));
        this.labelsRoot.appendChild(b.el);
      }
      const s = project(b.char, 0.75);
      if (!s || s.d > 60) b.el.style.display = 'none';
      else {
        b.el.style.display = '';
        b.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%,-100%)`;
        b.el.style.opacity = Math.min(1, b.t);
      }
      if (b.t <= 0) {
        b.el.remove();
        return false;
      }
      return true;
    });
  }
}
