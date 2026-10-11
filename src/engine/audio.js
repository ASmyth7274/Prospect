// Tiny WebAudio synth: all sound effects and ambience are generated, no audio files.
export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ambience = {};
    this.lastPlay = {};
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfx = this.ctx.createGain();
    this.sfx.connect(this.master);
    this.amb = this.ctx.createGain();
    this.amb.connect(this.master);
    this.mus = this.ctx.createGain();
    this.mus.connect(this.master);
    this.noiseBuf = this.makeNoise();
    this.applyVolume();
    this.startAmbience();
  }

  applyVolume() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.muted ? 0 : 1;
    this.sfx.gain.value = (s.sfxVolume ?? 0.7) * 0.9;
    this.amb.gain.value = (s.ambVolume ?? 0.5) * 0.6;
    this.mus.gain.value = (s.musicVolume ?? 0.35) * 0.5;
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.02 * w) / 1.02;
      d[i] = w * 0.5 + last * 3;
    }
    return b;
  }

  noise(dur, { freq = 800, q = 1, type = 'bandpass', gain = 0.4, attack = 0.005, decay, dest } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (decay ?? dur));
    src.connect(f).connect(g).connect(dest || this.sfx);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return { src, f, g };
  }

  tone(freq, dur, { type = 'sine', gain = 0.25, attack = 0.005, slide = 0, delay = 0, dest } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    const t = c.currentTime + delay;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  play(name, opt = {}) {
    if (!this.ctx || this.settings.muted) return;
    const now = performance.now();
    const minGap = { step: 60, splashStep: 60, shake: 50 }[name] || 0;
    if (minGap && now - (this.lastPlay[name] || 0) < minGap) return;
    this.lastPlay[name] = now;
    switch (name) {
      case 'dig':
        this.noise(0.25, { freq: 380, q: 0.8, type: 'lowpass', gain: 0.55, decay: 0.22 });
        this.tone(110, 0.12, { type: 'triangle', gain: 0.3, slide: 0.5 });
        break;
      case 'digHard':
        this.noise(0.2, { freq: 1600, q: 2, gain: 0.35, decay: 0.15 });
        this.tone(220, 0.1, { type: 'square', gain: 0.08, slide: 0.6 });
        break;
      case 'perfect':
        this.tone(880, 0.18, { type: 'triangle', gain: 0.22 });
        this.tone(1320, 0.25, { type: 'triangle', gain: 0.18, delay: 0.07 });
        break;
      case 'shake':
        this.noise(0.22, { freq: 1100 + Math.random() * 500, q: 1.5, gain: 0.22, decay: 0.2 });
        break;
      case 'splash':
        this.noise(0.5, { freq: 900, q: 0.6, gain: 0.45, decay: 0.45 });
        break;
      case 'step':
        this.noise(0.08, { freq: 300 + Math.random() * 200, q: 1, type: 'lowpass', gain: 0.12, decay: 0.07 });
        break;
      case 'splashStep':
        this.noise(0.15, { freq: 1200, q: 0.8, gain: 0.12, decay: 0.12 });
        break;
      case 'jump':
        this.tone(320, 0.15, { type: 'sine', gain: 0.1, slide: 1.8 });
        break;
      case 'land':
        this.noise(0.12, { freq: 200, type: 'lowpass', gain: 0.25, decay: 0.1 });
        break;
      case 'coin': {
        const n = opt.n || 1;
        for (let i = 0; i < Math.min(6, n); i++) {
          this.tone(1568, 0.12, { type: 'square', gain: 0.06, delay: i * 0.06 });
          this.tone(2093, 0.18, { type: 'square', gain: 0.05, delay: i * 0.06 + 0.04 });
        }
        break;
      }
      case 'find': {
        const tier = opt.tier || 0;
        const scales = [[523], [523, 659], [523, 659, 784], [523, 659, 784, 1047], [392, 523, 659, 784, 1047, 1319], [392, 523, 659, 784, 1047, 1319, 1568], [262, 392, 523, 659, 784, 1047, 1319, 1568, 2093]];
        const notes = scales[tier];
        notes.forEach((f, i) => this.tone(f, 0.35 + tier * 0.05, { type: tier >= 4 ? 'sawtooth' : 'triangle', gain: tier >= 4 ? 0.07 : 0.14, delay: i * (0.07 + tier * 0.005) }));
        if (tier >= 4) notes.forEach((f, i) => this.tone(f / 2, 0.6, { type: 'sine', gain: 0.12, delay: i * 0.08 }));
        break;
      }
      case 'shard':
        this.tone(1760, 0.2, { type: 'sine', gain: 0.12 });
        this.tone(2637, 0.3, { type: 'sine', gain: 0.1, delay: 0.06 });
        break;
      case 'ui':
        this.tone(660, 0.06, { type: 'triangle', gain: 0.08 });
        break;
      case 'open':
        this.tone(520, 0.08, { type: 'triangle', gain: 0.08 });
        this.tone(780, 0.1, { type: 'triangle', gain: 0.07, delay: 0.05 });
        break;
      case 'error':
        this.tone(180, 0.18, { type: 'square', gain: 0.07 });
        this.tone(140, 0.2, { type: 'square', gain: 0.07, delay: 0.09 });
        break;
      case 'buy':
        this.tone(784, 0.12, { type: 'triangle', gain: 0.12 });
        this.tone(1047, 0.12, { type: 'triangle', gain: 0.12, delay: 0.08 });
        this.tone(1568, 0.2, { type: 'triangle', gain: 0.12, delay: 0.16 });
        break;
      case 'quest':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', gain: 0.12, delay: i * 0.09 }));
        break;
      case 'levelup':
        [392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.4, { type: 'square', gain: 0.06, delay: i * 0.08 }));
        this.tone(1047, 0.9, { type: 'triangle', gain: 0.12, delay: 0.4 });
        break;
      case 'event':
        this.tone(330, 0.6, { type: 'sawtooth', gain: 0.05 });
        this.tone(440, 0.6, { type: 'sawtooth', gain: 0.05, delay: 0.15 });
        this.tone(660, 0.9, { type: 'triangle', gain: 0.1, delay: 0.3 });
        break;
      case 'meteor':
        this.noise(1.6, { freq: 160, type: 'lowpass', gain: 0.7, decay: 1.5, attack: 0.02 });
        this.tone(70, 1.2, { type: 'sine', gain: 0.4, slide: 0.5 });
        break;
      case 'whoosh':
        this.noise(0.6, { freq: 600, q: 0.7, gain: 0.25, attack: 0.2, decay: 0.55 });
        break;
      case 'enchant':
        [262, 330, 392, 523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', gain: 0.1, delay: i * 0.06 }));
        this.noise(1.2, { freq: 3000, q: 3, gain: 0.08, attack: 0.3, decay: 1.1 });
        break;
      case 'geode':
        this.noise(0.15, { freq: 2200, q: 3, gain: 0.3, decay: 0.12 });
        this.tone(1200, 0.4, { type: 'triangle', gain: 0.1, delay: 0.05 });
        break;
      case 'burn':
        this.noise(0.4, { freq: 2500, q: 0.5, type: 'highpass', gain: 0.2, decay: 0.35 });
        break;
    }
  }

  startAmbience() {
    const c = this.ctx;
    const mk = (freq, q, type) => {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.amb);
      src.start();
      return { g, f };
    };
    this.ambience.water = mk(1400, 0.4, 'bandpass');
    this.ambience.wind = mk(420, 0.6, 'bandpass');
    this.ambience.rain = mk(3200, 0.3, 'highpass');
    this.ambience.lava = mk(120, 0.8, 'lowpass');
    this.ambience.fall = mk(700, 0.3, 'bandpass');
    // gentle music: random pentatonic plucks
    this.musicTimer = 0;
  }

  setAmbience(levels) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [k, v] of Object.entries(levels)) {
      const a = this.ambience[k];
      if (a) a.g.gain.setTargetAtTime(v, t, 0.6);
    }
    if (this.ambience.wind) this.ambience.wind.f.frequency.setTargetAtTime(350 + Math.sin(t * 0.3) * 120, t, 1);
  }

  updateMusic(dt, night) {
    if (!this.ctx || (this.settings.musicVolume ?? 0.35) <= 0) return;
    this.musicTimer -= dt;
    if (this.musicTimer > 0) return;
    this.musicTimer = 0.45 + Math.random() * 0.9;
    const scale = night ? [220, 261.6, 293.7, 329.6, 392, 440] : [261.6, 293.7, 329.6, 392, 440, 523.3];
    if (Math.random() < 0.3) return;
    const f = scale[Math.floor(Math.random() * scale.length)] * (Math.random() < 0.2 ? 2 : 1);
    this.tone(f, 1.6, { type: 'triangle', gain: 0.07, attack: 0.01, dest: this.mus });
    if (Math.random() < 0.25) this.tone(f / 2, 2.2, { type: 'sine', gain: 0.06, dest: this.mus });
  }
}
