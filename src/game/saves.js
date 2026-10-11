// Save slots in localStorage (+ export/import as base64 JSON).
import { newSave, migrateSave } from './state.js';

const KEY = (i) => `prospect.save.${i}`;
export const SLOT_COUNT = 3;

export class Saves {
  read(i) {
    try {
      const raw = localStorage.getItem(KEY(i));
      if (!raw) return null;
      return migrateSave(JSON.parse(raw));
    } catch (e) {
      console.warn('save read failed', e);
      return null;
    }
  }

  write(i, data) {
    try {
      data.updated = Date.now();
      localStorage.setItem(KEY(i), JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('save write failed', e);
      return false;
    }
  }

  remove(i) {
    try {
      localStorage.removeItem(KEY(i));
    } catch (e) {
      /* ignore */
    }
  }

  create(i, name) {
    const s = newSave(name);
    this.write(i, s);
    return s;
  }

  exportString(data) {
    const json = JSON.stringify(data);
    return 'PROSPECT1:' + btoa(unescape(encodeURIComponent(json)));
  }

  importString(str) {
    try {
      const b = str.replace(/^PROSPECT1:/, '').trim();
      const json = decodeURIComponent(escape(atob(b)));
      const s = JSON.parse(json);
      if (!s || typeof s.money !== 'number' || !s.gear) return null;
      return migrateSave(s);
    } catch (e) {
      return null;
    }
  }
}

export function loadSettings() {
  const def = {
    quality: null,
    backend: 'auto',
    renderScale: 1,
    dynamicRes: true,
    fpsCap: 60,
    viewScale: 1,
    sfxVolume: 0.7,
    ambVolume: 0.5,
    musicVolume: 0.3,
    muted: false,
    autoCamera: true,
    showFps: false,
    dayScale: 1,
    autoSellCommon: false,
  };
  try {
    const s = JSON.parse(localStorage.getItem('prospect.settings') || '{}');
    return { ...def, ...s };
  } catch (e) {
    return def;
  }
}

export function storeSettings(s) {
  try {
    localStorage.setItem('prospect.settings', JSON.stringify(s));
  } catch (e) {
    /* ignore */
  }
}
