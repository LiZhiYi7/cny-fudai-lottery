// 硬像素文字：中文用"小字号渲染 + alpha 阈值化"得到无抗锯齿像素字；数字用 5×7 点阵。

import { PLT } from './palette.js';

const FONT_STACK =
  '"Fusion Pixel","Microsoft YaHei UI","Microsoft YaHei","SimHei","Noto Sans SC","PingFang SC","Hiragino Sans GB",sans-serif';

const MAX_CACHE = 480;
const maskCache = new Map();
const measureCache = new Map();
let measureCtx = null;
let tintCanvas = null;

function cacheSet(map, key, value) {
  if (map.size >= MAX_CACHE) {
    const first = map.keys().next();
    if (!first.done) map.delete(first.value);
  }
  map.set(key, value);
}

function getMeasureCtx() {
  if (!measureCtx) {
    const c = document.createElement('canvas');
    measureCtx = c.getContext('2d');
  }
  return measureCtx;
}

function fontOf(size, weight) {
  return `${weight} ${size}px ${FONT_STACK}`;
}

// 12px 像素字体的最小可读尺寸：小于 12px 会丢失笔画，统一抬到 12px。
function effSize(size) {
  const n = Math.round(Number(size) || 12);
  return n < 12 ? 12 : n;
}

function measureLine(text, size, weight) {
  const s = effSize(size);
  const key = `${s}|${weight}|${text}`;
  const hit = measureCache.get(key);
  if (hit !== undefined) return hit;
  const ctx = getMeasureCtx();
  ctx.font = fontOf(s, weight);
  const metrics = ctx.measureText(text);
  const w = metrics.width;
  cacheSet(measureCache, key, w);
  return w;
}

/** 白字蒙版：先用 3 倍尺寸栅格化，再按 3×3 覆盖平均并阈值化，
 *  规避 12px 小字号下 1px 笔画被亚像素抗锯齿吃掉的问题。 */
const SUPERSAMPLE = 3;

function getMask(text, size, weight) {
  const s = effSize(size);
  const key = `v2|${s}|${weight}|${text}`;
  const hit = maskCache.get(key);
  if (hit) return hit;

  const pad = Math.ceil(s * 0.4) + 2;
  const width = Math.max(1, Math.ceil(measureLine(text, s, weight)) + pad * 2);
  const height = Math.max(1, Math.ceil(s * 1.35) + pad * 2);
  const ss = SUPERSAMPLE;
  const big = document.createElement('canvas');
  big.width = Math.max(1, width * ss);
  big.height = Math.max(1, height * ss);
  const bg = big.getContext('2d');
  bg.font = fontOf(s * ss, weight);
  bg.textBaseline = 'top';
  bg.fillStyle = '#ffffff';
  bg.fillText(text, pad * ss, (pad + Math.round(s * 0.06)) * ss);

  const src = bg.getImageData(0, 0, big.width, big.height).data;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  const out = g.createImageData(width, height);
  const od = out.data;
  const area = ss * ss;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let a = 0;
      for (let j = 0; j < ss; j++) {
        const row = (y * ss + j) * big.width;
        for (let i = 0; i < ss; i++) {
          a += src[(row + x * ss + i) * 4 + 3];
        }
      }
      if (a / area >= 96) {
        const o = (y * width + x) * 4;
        od[o] = 255;
        od[o + 1] = 255;
        od[o + 2] = 255;
        od[o + 3] = 255;
      }
    }
  }
  g.putImageData(out, 0, 0);

  const entry = {
    key,
    canvas,
    pad,
    topOffset: pad + Math.round(s * 0.06),
    width,
    height,
    textWidth: Math.max(0, width - pad * 2),
  };
  cacheSet(maskCache, key, entry);
  return entry;
}

function getTinted(mask, color) {
  const key = `${mask.key}|${color}`;
  const hit = maskCache.get('tint:' + key);
  if (hit) return hit;
  if (!tintCanvas) tintCanvas = document.createElement('canvas');
  tintCanvas.width = mask.canvas.width;
  tintCanvas.height = mask.canvas.height;
  const g = tintCanvas.getContext('2d');
  g.clearRect(0, 0, tintCanvas.width, tintCanvas.height);
  g.globalCompositeOperation = 'source-over';
  g.drawImage(mask.canvas, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, tintCanvas.width, tintCanvas.height);
  const out = document.createElement('canvas');
  out.width = tintCanvas.width;
  out.height = tintCanvas.height;
  out.getContext('2d').drawImage(tintCanvas, 0, 0);
  cacheSet(maskCache, 'tint:' + key, out);
  return out;
}

function drawTinted(ctx, mask, color, x, y, alpha, outline, outlineColor) {
  const tinted = getTinted(mask, color);
  const px = Math.round(x);
  const py = Math.round(y);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = alpha;
  if (outline > 0) {
    const oc = getTinted(mask, outlineColor || PLT.ink);
    const r = Math.max(1, Math.round(outline));
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        if (ox === 0 && oy === 0) continue;
        if (Math.abs(ox) + Math.abs(oy) > r + 0.5) continue;
        ctx.drawImage(oc, px + ox, py + oy);
      }
    }
  }
  ctx.drawImage(tinted, px, py);
  ctx.restore();
}

const DEFAULT_OPTS = {
  size: 16,
  color: PLT.cream,
  align: 'left',
  valign: 'top',
  outline: 0,
  outlineColor: PLT.ink,
  alpha: 1,
  weight: 'normal',
};

export const Txt = {
  fontStack: FONT_STACK,

  /** 启动时等待像素字体就绪，避免首帧用系统字体缓存错误字形 */
  async load() {
    if (typeof document === 'undefined' || !document.fonts) return;
    try {
      await document.fonts.load('12px "Fusion Pixel"', '新春福袋抓奖号');
      await document.fonts.ready;
    } catch {
      /* 字体缺失时回退系统字体 */
    }
  },

  measure(text, opts = {}) {
    const o = { ...DEFAULT_OPTS, ...opts };
    const size = effSize(o.size);
    const lines = String(text).split('\n');
    let w = 0;
    for (const line of lines) w = Math.max(w, measureLine(line, size, o.weight));
    return { w, h: size * 1.28 * lines.length, lines };
  },

  fit(text, maxWidth, opts = {}) {
    const o = { ...DEFAULT_OPTS, ...opts };
    const t = String(text);
    if (measureLine(t, o.size, o.weight) <= maxWidth) return t;
    const ell = '…';
    let lo = 0;
    let hi = t.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (measureLine(t.slice(0, mid) + ell, o.size, o.weight) <= maxWidth) lo = mid;
      else hi = mid - 1;
    }
    return lo > 0 ? t.slice(0, lo) + ell : '';
  },

  draw(ctx, text, x, y, opts = {}) {
    const o = { ...DEFAULT_OPTS, ...opts };
    if (text === null || text === undefined) return 0;
    const size = effSize(o.size);
    const lines = String(text).split('\n');
    const lineH = size * 1.28;
    let blockTop = y;
    if (o.valign === 'middle') blockTop = y - (lineH * lines.length) / 2;
    else if (o.valign === 'bottom') blockTop = y - lineH * lines.length;

    let maxW = 0;
    lines.forEach((line, i) => {
      if (!line) return;
      const mask = getMask(line, size, o.weight);
      let dx = x;
      if (o.align === 'center') dx = x - mask.textWidth / 2;
      else if (o.align === 'right') dx = x - mask.textWidth;
      const dy = blockTop + i * lineH;
      drawTinted(
        ctx,
        mask,
        o.color,
        dx - mask.pad,
        dy - mask.topOffset,
        o.alpha,
        o.outline,
        o.outlineColor
      );
      maxW = Math.max(maxW, mask.textWidth);
    });
    return maxW;
  },

  /** 5×7 点阵数字与符号；unit = 每个点阵像素的绘制尺寸 */
  digits(ctx, text, x, y, opts = {}) {
    const o = {
      unit: 2,
      color: PLT.cream,
      align: 'left',
      valign: 'top',
      outline: 0,
      outlineColor: PLT.ink,
      alpha: 1,
      glow: false,
      ...opts,
    };
    const str = String(text);
    const cw = 5 * o.unit;
    const ch = 7 * o.unit;
    const adv = 6 * o.unit;
    const totalW = Math.max(0, str.length * adv - o.unit);
    let startX = x;
    if (o.align === 'center') startX = x - totalW / 2;
    else if (o.align === 'right') startX = x - totalW;
    let startY = y;
    if (o.valign === 'middle') startY = y - ch / 2;
    else if (o.valign === 'bottom') startY = y - ch;

    const paint = (col, ox, oy, alpha) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = col;
      for (let i = 0; i < str.length; i++) {
        const glyph = GLYPHS[str[i]] || GLYPHS[' '];
        if (!glyph) continue;
        const baseX = Math.round(startX + i * adv + ox);
        const baseY = Math.round(startY + oy);
        for (let ry = 0; ry < 7; ry++) {
          const row = glyph[ry];
          for (let rx = 0; rx < 5; rx++) {
            if (row[rx] === '1') {
              ctx.fillRect(baseX + rx * o.unit, baseY + ry * o.unit, o.unit, o.unit);
            }
          }
        }
      }
      ctx.restore();
    };

    if (o.outline > 0) {
      const r = Math.max(1, Math.round(o.outline));
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (ox === 0 && oy === 0) continue;
          paint(o.outlineColor, ox, oy, o.alpha);
        }
      }
    }
    paint(o.color, 0, 0, o.alpha);
    return totalW;
  },

  measureDigits(text, opts = {}) {
    const unit = opts.unit || 2;
    const str = String(text);
    return { w: Math.max(0, str.length * 6 * unit - unit), h: 7 * unit };
  },
};

// 5×7 点阵字体
const GLYPHS = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '00110', '00110'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
  '+': ['00000', '00100', '00100', '11111', '00100', '00100', '00000'],
  '%': ['11001', '11010', '00100', '00100', '01000', '01011', '10011'],
};
