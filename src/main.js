import './ui/style.css';
import { createRenderer, detectDefaultQuality, QUALITY_PRESETS } from './engine/renderer.js';
import { Saves, SLOT_COUNT, loadSettings, storeSettings } from './game/saves.js';
import { Game } from './game/game.js';
import { fmtMoney, fmtTime, esc } from './ui/format.js';

const $ = (s) => document.querySelector(s);
const saves = new Saves();
const settings = loadSettings();
if (!settings.quality) {
  settings.quality = detectDefaultQuality();
  storeSettings(settings);
}

const TIPS = [
  'Release the dig meter in the green zone for a Perfect Dig: 30% more dirt!',
  'Harder sand (higher Toughness) hides rarer minerals. Upgrade your shovel to dig there.',
  'Display one of every mineral in the Fortune Museum for permanent boosts.',
  'Meteor Showers happen at night. Dig the craters for Meteoric Iron and Starshine!',
  'Stand near a campfire on Frozen Peak or you’ll freeze.',
  'Place a sluice in shallow water and it keeps panning while you’re away.',
  'Lock your favourite minerals in the backpack so you never sell them by accident.',
  'Other prospectors drop totems. Stand inside the ring for a free boost!',
  'Aurorite and Aetherite power the Mysterious Altar deep in the Crystal Caverns.',
];

function renderTitle() {
  const t = $('#title');
  t.classList.remove('hidden');
  let slots = '';
  for (let i = 0; i < SLOT_COUNT; i++) {
    const s = saves.read(i);
    if (s) {
      slots += `<div class="saveslot"><h3>💾 ${esc(s.name)}</h3><div class="meta">Level ${s.level} • ${fmtMoney(s.money)} • ◆ ${s.shards}<br>${s.gear.pan.replace(/_/g, ' ')} + ${s.gear.shovel.replace(/_/g, ' ')}<br>Played ${fmtTime(s.playTime)} • ${new Date(s.updated).toLocaleDateString()}</div><div class="btns"><button class="btn gold" data-play="${i}">▶ Play</button><button class="btn small red" data-del="${i}">Delete</button></div></div>`;
    } else {
      slots += `<div class="saveslot"><h3>✨ Empty slot ${i + 1}</h3><input class="namebox" maxlength="18" placeholder="Prospector name" id="name${i}" value="Prospector${Math.floor(Math.random() * 900 + 100)}"><div class="btns"><button class="btn" data-new="${i}">⛏️ New game</button></div></div>`;
    }
  }
  const q = settings.quality;
  const gpu = navigator.gpu ? 'WebGPU available' + (/Mac|iPhone|iPad/.test(navigator.userAgent) ? ' (Apple Metal)' : '') : 'WebGL2 mode';
  t.innerHTML = `<div class="logo">Prospect!</div><div class="tag stroke">Dig. Pan. Strike it rich.</div><div class="slots">${slots}</div>
  <div class="title-foot"><div class="seg">${Object.entries(QUALITY_PRESETS)
    .map(([k, v]) => `<button class="${q === k ? 'on' : ''}" data-q="${k}">${v.label}</button>`)
    .join('')}</div><div class="seg"><button class="${settings.backend !== 'webgl' ? 'on' : ''}" data-b="auto">WebGPU / Metal</button><button class="${settings.backend === 'webgl' ? 'on' : ''}" data-b="webgl">WebGL2</button></div></div>
  <div class="badge-gpu">${gpu} • Install to your Home Screen for full-screen play</div>`;
  t.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.play) start(+b.dataset.play);
    else if (b.dataset.new) {
      const name = ($('#name' + b.dataset.new).value || 'Prospector').trim().slice(0, 18);
      saves.create(+b.dataset.new, name);
      start(+b.dataset.new);
    } else if (b.dataset.del) {
      if (confirm('Delete this save forever?')) {
        saves.remove(+b.dataset.del);
        renderTitle();
      }
    } else if (b.dataset.q) {
      settings.quality = b.dataset.q;
      storeSettings(settings);
      renderTitle();
    } else if (b.dataset.b) {
      settings.backend = b.dataset.b;
      storeSettings(settings);
      renderTitle();
    }
  };
}

async function start(slot) {
  const save = saves.read(slot);
  if (!save) return renderTitle();
  $('#title').classList.add('hidden');
  const L = $('#loading');
  L.classList.remove('hidden');
  L.innerHTML = `<div class="logo">Prospect!</div><div class="bar"><i id="lbar"></i></div><div class="msg stroke" id="lmsg">Starting engine…</div><div class="tip">💡 ${TIPS[Math.floor(Math.random() * TIPS.length)]}</div>`;
  const bar = $('#lbar'),
    msg = $('#lmsg');
  const progress = (p, m) => {
    bar.style.width = Math.round(p * 100) + '%';
    if (m) msg.textContent = m;
  };
  try {
    const r = await createRenderer($('#game'), settings);
    progress(0.01, `Renderer: ${r.backendName}${r.metal ? ' (Metal)' : ''}`);
    const game = new Game({ ...r, settings, saves, slot, save });
    await game.init(progress);
    L.classList.add('hidden');
    game.start();
  } catch (err) {
    console.error(err);
    msg.innerHTML = `<span style="color:#ff8a8a">Something went wrong: ${esc(err.message || err)}</span><br><button class="btn" onclick="localStorage.setItem('prospect.settings', JSON.stringify({...JSON.parse(localStorage.getItem('prospect.settings')||'{}'), backend:'webgl', quality:'low'})); location.reload()">Retry in safe mode (WebGL2, Low)</button>`;
  }
}

// PWA service worker (production builds only)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW registration failed', e));
  });
}

// Prevent iOS double-tap zoom / pinch on UI
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('dblclick', (e) => e.preventDefault());

const params = new URLSearchParams(location.search);
let auto = null;
try {
  auto = sessionStorage.getItem('prospect.autostart');
  sessionStorage.removeItem('prospect.autostart');
} catch (e) {
  /* ignore */
}
if (params.has('slot')) auto = params.get('slot');
if (auto !== null && auto !== undefined) {
  const i = +auto;
  if (!saves.read(i)) saves.create(i, params.get('name') || 'Prospector');
  start(i);
} else renderTitle();
