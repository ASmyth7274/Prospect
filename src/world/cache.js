// IndexedDB cache for generated world buffers so repeat launches skip generation.
import { hashString } from './noise.js';
import * as layout from './layout.js';
import { GROUND_COLORS, SITES } from '../data/sites.js';

const GEN_VERSION = 8;
const DB = 'prospect-world';
const STORE = 'buffers';

export function worldCacheKey() {
  const src = JSON.stringify({
    v: GEN_VERSION,
    rivers: layout.RIVERS,
    lakes: layout.LAKES,
    lava: layout.LAVA_LAKES,
    paths: layout.PATHS,
    biomes: layout.BIOMES,
    island: layout.MAIN_ISLAND,
    caldera: layout.CALDERA,
    cavern: layout.CAVERN,
    sites: layout.DIG_SITES,
    ground: GROUND_COLORS,
    siteGround: Object.fromEntries(Object.entries(SITES).map(([k, v]) => [k, v.ground])),
    seed: layout.SEED,
  });
  return 'world-' + hashString(src).toString(36);
}

function open() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no idb'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadWorldCache(key) {
  try {
    const db = await open();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readonly');
      const r = tx.objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

export async function saveWorldCache(key, buffers) {
  try {
    const db = await open();
    await new Promise((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      const st = tx.objectStore(STORE);
      st.clear();
      st.put(buffers, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (e) {
    /* storage may be unavailable (private mode) */
  }
}
