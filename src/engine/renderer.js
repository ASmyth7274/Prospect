// Renderer setup tuned for Apple GPUs (Metal via WebGPU, tile-based deferred renderers).
//
// Key choices:
//  * WebGPURenderer -> WebGPU (Metal on Safari/macOS/iOS 26+) with automatic WebGL2 fallback.
//  * No tone mapping / colour-space conversion pass: the renderer writes straight into the
//    drawable, so there is a single render pass per frame and MSAA resolves on-tile (cheap on TBDR).
//  * Opaque canvas (alpha:false) avoids compositor blending on iOS.
//  * Dynamic resolution keeps frame time on target; FPS cap avoids burning battery at 120Hz.

import * as THREE from 'three/webgpu';

export const QUALITY_PRESETS = {
  low: { label: 'Low', scale: 0.65, maxDPR: 1.5, shadows: 0, viewDist: 300, msaa: false, props: 0.45, particles: 0.5, grass: 0, clouds: 12, shadowEvery: 0 },
  medium: { label: 'Medium', scale: 0.85, maxDPR: 2, shadows: 1024, viewDist: 420, msaa: true, props: 0.75, particles: 0.8, grass: 0.5, clouds: 24, shadowEvery: 2 },
  high: { label: 'High', scale: 1.0, maxDPR: 2, shadows: 2048, viewDist: 560, msaa: true, props: 1, particles: 1, grass: 1, clouds: 36, shadowEvery: 1 },
  ultra: { label: 'Ultra', scale: 1.0, maxDPR: 3, shadows: 4096, viewDist: 760, msaa: true, props: 1, particles: 1.3, grass: 1.5, clouds: 48, shadowEvery: 1 },
};

export function detectDefaultQuality() {
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const cores = navigator.hardwareConcurrency || 4;
  if (isIOS) return /iPad/.test(ua) || navigator.maxTouchPoints > 1 && screen.width >= 768 ? 'high' : 'medium';
  if (isAndroid) return cores >= 8 ? 'medium' : 'low';
  return 'high';
}

export function isAppleDevice() {
  const ua = navigator.userAgent;
  return /Mac|iPhone|iPad|iPod/.test(ua);
}

// three r186 always passes `swizzle: 'rgba'` in texture-view descriptors. Browsers that shipped an
// older form of the swizzle proposal reject the string, so strip the identity swizzle.
function patchWebGPUSwizzle() {
  if (typeof GPUTexture === 'undefined' || GPUTexture.prototype.__prospectPatched) return;
  const orig = GPUTexture.prototype.createView;
  GPUTexture.prototype.createView = function (desc) {
    if (desc && desc.swizzle === 'rgba') {
      delete desc.swizzle;
      try {
        return orig.call(this, desc);
      } finally {
        desc.swizzle = 'rgba';
      }
    }
    return orig.call(this, desc);
  };
  GPUTexture.prototype.__prospectPatched = true;
}

export async function createRenderer(container, settings) {
  patchWebGPUSwizzle();
  // Disable colour management: colours are authored in display space and the frame is written
  // directly to the drawable (no intermediate half-float target + output pass).
  THREE.ColorManagement.enabled = false;

  const q = QUALITY_PRESETS[settings.quality] || QUALITY_PRESETS.high;
  const wantWebGL = settings.backend === 'webgl';
  const hasWebGPU = typeof navigator !== 'undefined' && !!navigator.gpu;

  const make = (forceWebGL) =>
    new THREE.WebGPURenderer({
      antialias: q.msaa,
      alpha: false,
      forceWebGL,
      powerPreference: 'high-performance',
      // Keep output buffers 8-bit; we never need HDR intermediates.
      outputBufferType: THREE.UnsignedByteType,
    });

  let renderer = make(wantWebGL || !hasWebGPU);
  try {
    await renderer.init();
  } catch (err) {
    console.warn('WebGPU init failed, falling back to WebGL2', err);
    try {
      renderer.dispose();
    } catch (e) {
      /* ignore */
    }
    renderer = make(true);
    await renderer.init();
  }

  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.setClearColor(0x87b8e8, 1);
  renderer.shadowMap.enabled = q.shadows > 0;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.domElement.id = 'game-canvas';
  container.appendChild(renderer.domElement);

  const backend = renderer.backend;
  const backendName = backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  let gpuName = '';
  try {
    if (backend.isWebGPUBackend && backend.device && backend.adapter?.info) {
      const info = backend.adapter.info;
      gpuName = [info.vendor, info.architecture, info.description].filter(Boolean).join(' ');
    } else if (backend.gl) {
      const gl = backend.gl;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpuName = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }
  } catch (e) {
    /* ignore */
  }
  const metal = backend.isWebGPUBackend ? isAppleDevice() : /Metal|Apple/i.test(gpuName);
  return { renderer, backendName, gpuName, metal, quality: q };
}

// Dynamic resolution controller: adjusts pixel ratio to hold a target frame time.
export class ResolutionController {
  constructor(renderer, settings) {
    this.renderer = renderer;
    this.settings = settings;
    this.scale = 1;
    this.acc = 0;
    this.frames = 0;
    this.cooldown = 0;
    this.apply();
  }

  baseDPR() {
    const q = QUALITY_PRESETS[this.settings.quality] || QUALITY_PRESETS.high;
    return Math.min(window.devicePixelRatio || 1, q.maxDPR) * q.scale * (this.settings.renderScale ?? 1);
  }

  apply() {
    const dpr = Math.max(0.35, this.baseDPR() * this.scale);
    if (Math.abs(dpr - this.renderer.getPixelRatio()) > 0.01) this.renderer.setPixelRatio(dpr);
  }

  update(frameMs, targetMs) {
    if (!this.settings.dynamicRes) {
      if (this.scale !== 1) {
        this.scale = 1;
        this.apply();
      }
      return;
    }
    this.acc += frameMs;
    this.frames++;
    this.cooldown -= frameMs;
    if (this.frames >= 30 && this.cooldown <= 0) {
      const avg = this.acc / this.frames;
      this.acc = 0;
      this.frames = 0;
      if (avg > targetMs * 1.12 && this.scale > 0.55) {
        this.scale = Math.max(0.55, this.scale - 0.08);
        this.apply();
        this.cooldown = 1500;
      } else if (avg < targetMs * 0.82 && this.scale < 1) {
        this.scale = Math.min(1, this.scale + 0.05);
        this.apply();
        this.cooldown = 2500;
      }
    }
  }
}
