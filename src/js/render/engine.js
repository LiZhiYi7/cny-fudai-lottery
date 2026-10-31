// 画布引擎：固定 640×360 内部分辨率，整数倍最近邻放大，居中留黑边。

import { VIEW } from './geometry.js';
import { PLT } from './palette.js';

export const Render = {
  canvas: null,
  ctx: null,
  scale: 1,
  _listeners: [],

  init(canvas) {
    this.canvas = canvas;
    let ctx = null;
    try {
      ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    } catch {
      ctx = canvas.getContext('2d');
    }
    if (!ctx) throw new Error('canvas 2d context unavailable');
    this.ctx = ctx;
    canvas.width = VIEW.W;
    canvas.height = VIEW.H;
    this.ctx.imageSmoothingEnabled = false;
    this.fit();
    window.addEventListener('resize', () => this.fit());
    // 屏幕旋转/缩放变化
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.fit());
    }
    return this;
  },

  fit() {
    if (!this.canvas) return;
    const availW = Math.max(320, window.innerWidth);
    const availH = Math.max(180, window.innerHeight);
    const exact = Math.min(availW / VIEW.W, availH / VIEW.H);
    let scale = Math.floor(exact);
    // 窗口不是精确整数倍时，若整数倍会让画面小于窗口 75%，改用小数倍填满
    if (scale >= 1 && exact - scale > 0.2 && scale * VIEW.W < availW * 0.8) {
      scale = exact;
    }
    if (scale < 1) scale = exact;
    this.scale = scale;
    const w = Math.round(VIEW.W * scale);
    const h = Math.round(VIEW.H * scale);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    const frame = this.canvas.parentElement;
    if (frame) {
      frame.style.width = w + 'px';
      frame.style.height = h + 'px';
    }
    this._listeners.forEach((cb) => cb(scale));
  },

  onResize(cb) {
    this._listeners.push(cb);
    cb(this.scale);
  },

  begin() {
    const ctx = this.ctx;
    const c = VIEW.W;
    const h = VIEW.H;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = PLT.void;
    ctx.fillRect(0, 0, c, h);
    ctx.imageSmoothingEnabled = false;
  },

  end() {
    // 预留：未来可在此统一叠加扫描线/暗角
  },

  /** 鼠标/触摸事件 → 640×360 内部坐标 */
  pointer(evt) {
    if (!this.canvas) return { x: 0, y: 0 };
    const rect = this.canvas.getBoundingClientRect();
    const scale = this.scale || 1;
    return {
      x: (evt.clientX - rect.left) / scale,
      y: (evt.clientY - rect.top) / scale,
    };
  },

  isInside(x, y) {
    return x >= 0 && y >= 0 && x <= VIEW.W && y <= VIEW.H;
  },
};
