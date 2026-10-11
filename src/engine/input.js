// Unified keyboard / mouse / trackpad / touch input.
export class Input {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.look = { dx: 0, dy: 0 };
    this.zoom = 0;
    this.actionHeld = false;
    this.jumpPressed = false;
    this.interactPressed = false;
    this.sprint = false;
    this.handlers = {};
    this.enabled = true;
    this.touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
    this.lookTouch = { id: null, x: 0, y: 0 };
    this.pinch = null;
    this.lastLookTime = 0;
    this.mouseAction = false;
    this.touchAction = false;
    this.bind();
  }

  on(name, fn) {
    (this.handlers[name] ||= []).push(fn);
  }

  emit(name, ...args) {
    (this.handlers[name] || []).forEach((f) => f(...args));
  }

  isTyping(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (this.isTyping(e)) return;
      if (e.repeat) {
        if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      if (e.code === 'Tab') e.preventDefault();
      if (e.code === 'Space') {
        this.jumpPressed = true;
        e.preventDefault();
      }
      if (e.code === 'KeyE' || e.code === 'KeyF') this.interactPressed = true;
      this.emit('key', e.code, e);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.actionHeld = false;
      this.mouseAction = false;
    });

    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    let rightDrag = false;
    let lastX = 0,
      lastY = 0;
    c.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseAction = true;
      } else if (e.button === 2 || e.button === 1) {
        rightDrag = true;
        lastX = e.clientX;
        lastY = e.clientY;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseAction = false;
      if (e.button === 2 || e.button === 1) rightDrag = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (rightDrag || (this.pointerLocked && document.pointerLockElement === c)) {
        const dx = this.pointerLocked ? e.movementX : e.clientX - lastX;
        const dy = this.pointerLocked ? e.movementY : e.clientY - lastY;
        this.look.dx += dx * 0.005;
        this.look.dy += dy * 0.004;
        lastX = e.clientX;
        lastY = e.clientY;
        this.lastLookTime = performance.now();
      }
    });
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.ctrlKey) {
          // trackpad pinch
          this.zoom += e.deltaY * 0.02;
        } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) * 0.6 && e.deltaMode === 0) {
          // two-finger horizontal swipe rotates camera (Mac trackpads)
          this.look.dx += e.deltaX * 0.004;
          this.lastLookTime = performance.now();
        } else {
          this.zoom += Math.sign(e.deltaY) * Math.min(4, Math.abs(e.deltaY) * (e.deltaMode ? 1 : 0.025));
        }
      },
      { passive: false },
    );

    // ---- touch ----
    c.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    c.addEventListener('touchmove', (e) => this.onTouchMove(e), { passive: false });
    c.addEventListener('touchend', (e) => this.onTouchEnd(e), { passive: false });
    c.addEventListener('touchcancel', (e) => this.onTouchEnd(e), { passive: false });
  }

  setJoystickEls(base, knob) {
    this.joyBase = base;
    this.joyKnob = knob;
  }

  onTouchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const w = window.innerWidth;
      if (t.clientX < w * 0.42 && this.joy.id === null) {
        this.joy.id = t.identifier;
        this.joy.ox = t.clientX;
        this.joy.oy = t.clientY;
        this.joy.x = 0;
        this.joy.y = 0;
        if (this.joyBase) {
          this.joyBase.style.display = 'block';
          this.joyBase.style.left = t.clientX + 'px';
          this.joyBase.style.top = t.clientY + 'px';
          this.joyKnob.style.transform = 'translate(-50%,-50%)';
        }
      } else if (this.lookTouch.id === null) {
        this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY, sx: t.clientX, sy: t.clientY, t: performance.now() };
      } else if (!this.pinch) {
        const other = this.lookTouch;
        this.pinch = { a: other.id, b: t.identifier, d: Math.hypot(t.clientX - other.x, t.clientY - other.y), bx: t.clientX, by: t.clientY };
      }
    }
  }

  onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === this.joy.id) {
        const dx = t.clientX - this.joy.ox;
        const dy = t.clientY - this.joy.oy;
        const r = 56;
        const len = Math.hypot(dx, dy);
        const k = len > r ? r / len : 1;
        this.joy.x = (dx * k) / r;
        this.joy.y = (dy * k) / r;
        if (this.joyKnob) this.joyKnob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
      } else if (this.pinch && (t.identifier === this.pinch.a || t.identifier === this.pinch.b)) {
        if (t.identifier === this.pinch.a) {
          this.lookTouch.x = t.clientX;
          this.lookTouch.y = t.clientY;
        } else {
          this.pinch.bx = t.clientX;
          this.pinch.by = t.clientY;
        }
        const d = Math.hypot(this.pinch.bx - this.lookTouch.x, this.pinch.by - this.lookTouch.y);
        this.zoom += (this.pinch.d - d) * 0.06;
        this.pinch.d = d;
      } else if (t.identifier === this.lookTouch.id) {
        this.look.dx += (t.clientX - this.lookTouch.x) * 0.008;
        this.look.dy += (t.clientY - this.lookTouch.y) * 0.006;
        this.lookTouch.x = t.clientX;
        this.lookTouch.y = t.clientY;
        this.lastLookTime = performance.now();
      }
    }
  }

  onTouchEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.joy.id) {
        this.joy.id = null;
        this.joy.x = this.joy.y = 0;
        if (this.joyBase) this.joyBase.style.display = 'none';
      }
      if (this.pinch && (t.identifier === this.pinch.a || t.identifier === this.pinch.b)) {
        this.pinch = null;
      }
      if (t.identifier === this.lookTouch.id) {
        // a quick tap on the world triggers the action (dig/shake) on touch devices
        const dt = performance.now() - (this.lookTouch.t || 0);
        const moved = Math.hypot(t.clientX - this.lookTouch.sx, t.clientY - this.lookTouch.sy);
        if (dt < 220 && moved < 10) this.emit('tap', t.clientX, t.clientY);
        this.lookTouch = { id: null, x: 0, y: 0 };
      }
    }
  }

  update() {
    let x = 0,
      y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (k.has('KeyA')) x -= 1;
    if (k.has('KeyD')) x += 1;
    if (k.has('ArrowLeft')) this.look.dx -= 0.035;
    if (k.has('ArrowRight')) this.look.dx += 0.035;
    if (this.joy.id !== null) {
      x += this.joy.x;
      y += this.joy.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.move.x = x;
    this.move.y = y;
    this.sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    this.actionHeld = this.mouseAction || this.touchAction;
  }

  consume() {
    const r = { look: { ...this.look }, zoom: this.zoom, jump: this.jumpPressed, interact: this.interactPressed };
    this.look.dx = this.look.dy = 0;
    this.zoom = 0;
    this.jumpPressed = false;
    this.interactPressed = false;
    return r;
  }
}
