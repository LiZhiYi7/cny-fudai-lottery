// 可复用像素精灵 + 底层「无抗锯齿」绘制工具。
// 所有形状由整数矩形 / 布里森汉姆线段 / 逐行圆组成，不使用 arc/ellipse/贝塞尔，
// 保证在 640×360 内部画布上每个像素都是硬边。

import { PLT, alpha } from './palette.js';

const R = Math.round;

export function num(v, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/* ------------------------------------------------------------------ */
/* 底层像素工具                                                        */
/* ------------------------------------------------------------------ */

export const PX = {
  /** 实心矩形（坐标为 640 画布坐标，绘制前取整） */
  rect(ctx, x, y, w, h, color) {
    const rw = R(w);
    const rh = R(h);
    if (rw <= 0 || rh <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(R(x), R(y), rw, rh);
  },

  /** 带透明度的矩形（会临时修改 globalAlpha，之后恢复） */
  rectA(ctx, x, y, w, h, color, a) {
    const rw = R(w);
    const rh = R(h);
    const aa = clamp(num(a, 1), 0, 1);
    if (rw <= 0 || rh <= 0 || aa <= 0) return;
    if (aa >= 1) {
      PX.rect(ctx, x, y, rw, rh, color);
      return;
    }
    ctx.save();
    ctx.globalAlpha = aa;
    ctx.fillStyle = color;
    ctx.fillRect(R(x), R(y), rw, rh);
    ctx.restore();
  },

  dot(ctx, x, y, color) {
    ctx.fillStyle = color;
    ctx.fillRect(R(x), R(y), 1, 1);
  },

  hline(ctx, x, y, w, color, t = 1) {
    PX.rect(ctx, x, y, w, Math.max(1, R(t)), color);
  },

  vline(ctx, x, y, h, color, t = 1) {
    PX.rect(ctx, x, y, Math.max(1, R(t)), h, color);
  },

  /** 1px（或 t px）描边矩形 */
  frame(ctx, x, y, w, h, color, t = 1) {
    const rw = R(w);
    const rh = R(h);
    const tt = Math.max(1, R(t));
    if (rw <= 0 || rh <= 0) return;
    PX.rect(ctx, x, y, rw, tt, color);
    PX.rect(ctx, x, y + rh - tt, rw, tt, color);
    PX.rect(ctx, x, y, tt, rh, color);
    PX.rect(ctx, x + rw - tt, y, tt, rh, color);
  },

  /** 布里森汉姆线段（size 为每颗像素点边长） */
  line(ctx, x0, y0, x1, y1, color, size = 1) {
    let ax = R(x0);
    let ay = R(y0);
    const bx = R(x1);
    const by = R(y1);
    const s = Math.max(1, R(size));
    const dx = Math.abs(bx - ax);
    const dy = Math.abs(by - ay);
    const sx = ax < bx ? 1 : -1;
    const sy = ay < by ? 1 : -1;
    let err = dx - dy;
    ctx.fillStyle = color;
    for (let guard = 0; guard < 6000; guard++) {
      ctx.fillRect(ax, ay, s, s);
      if (ax === bx && ay === by) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        ax += sx;
      }
      if (e2 < dx) {
        err += dx;
        ay += sy;
      }
    }
  },

  /** 实心像素圆（逐行水平 span，边缘为整像素台阶） */
  circle(ctx, cx, cy, r, color) {
    const rr = Math.max(0, R(r));
    const ccx = R(cx);
    const ccy = R(cy);
    ctx.fillStyle = color;
    for (let dy = -rr; dy <= rr; dy++) {
      const span = Math.floor(Math.sqrt(Math.max(0, rr * rr - dy * dy) + rr * 0.45));
      if (span < 0) continue;
      ctx.fillRect(ccx - span, ccy + dy, span * 2 + 1, 1);
    }
  },

  /** 像素圆环（中点画圆法） */
  circleOutline(ctx, cx, cy, r, color, size = 1) {
    const rr = Math.max(1, R(r));
    const s = Math.max(1, R(size));
    const ccx = R(cx);
    const ccy = R(cy);
    ctx.fillStyle = color;
    let x = rr;
    let y = 0;
    let err = 1 - rr;
    while (x >= y) {
      const pts = [
        [x, y],
        [y, x],
        [-y, x],
        [-x, y],
        [-x, -y],
        [-y, -x],
        [y, -x],
        [x, -y],
      ];
      for (let i = 0; i < pts.length; i++) {
        ctx.fillRect(ccx + pts[i][0], ccy + pts[i][1], s, s);
      }
      y++;
      if (err < 0) err += 2 * y + 1;
      else {
        x--;
        err += 2 * (y - x) + 1;
      }
    }
  },

  /** 字符位图：rows 为等长字符串数组，map 为 字符→颜色 */
  bitmap(ctx, rows, x, y, scale, map) {
    const s = Math.max(1, R(scale));
    const ox = R(x);
    const oy = R(y);
    for (let ry = 0; ry < rows.length; ry++) {
      const row = rows[ry];
      for (let rx = 0; rx < row.length; rx++) {
        const col = map[row[rx]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(ox + rx * s, oy + ry * s, s, s);
      }
    }
  },

  /** 棋盘抖动填充 */
  dither(ctx, x, y, w, h, colorA, colorB, step = 2) {
    const x0 = R(x);
    const y0 = R(y);
    const w0 = R(w);
    const h0 = R(h);
    if (w0 <= 0 || h0 <= 0) return;
    ctx.fillStyle = colorA;
    ctx.fillRect(x0, y0, w0, h0);
    if (!colorB) return;
    const s = Math.max(1, R(step));
    ctx.fillStyle = colorB;
    for (let yy = 0; yy < h0; yy += s) {
      const row = Math.floor(yy / s);
      for (let xx = (row % 2) * s; xx < w0; xx += s * 2) {
        ctx.fillRect(x0 + xx, y0 + yy, Math.min(s, w0 - xx), Math.min(s, h0 - yy));
      }
    }
  },
};

/* ------------------------------------------------------------------ */
/* 发光缓存：预制离屏径向光斑，避免每帧逐像素绘制                      */
/* ------------------------------------------------------------------ */

const glowCache = new Map();
const GLOW_LIMIT = 96;

function rgbOf(hex) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  const n = parseInt(h, 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function glowSprite(color, radius) {
  const r = Math.max(2, R(radius));
  const key = color + '|' + r;
  const hit = glowCache.get(key);
  if (hit) return hit;
  if (typeof document === 'undefined') return null;
  const size = r * 2 + 1;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  if (!g) return null;
  // 直接写 ImageData：比逐像素 fillRect 快一个数量级，且边缘仍为硬像素台阶
  let img;
  let data;
  try {
    img = g.createImageData(size, size);
    data = img.data;
  } catch {
    return null;
  }
  const rgb = rgbOf(color);
  const denom = r * r;
  for (let y = -r; y <= r; y++) {
    const yy = y * y;
    for (let x = -r; x <= r; x++) {
      const dist = (x * x + yy) / denom;
      if (dist > 1) continue;
      const fall = 1 - Math.sqrt(dist);
      const a = fall * fall * 0.85;
      const idx = ((y + r) * size + (x + r)) * 4;
      data[idx] = rgb[0];
      data[idx + 1] = rgb[1];
      data[idx + 2] = rgb[2];
      data[idx + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  if (glowCache.size >= GLOW_LIMIT) {
    const oldest = glowCache.keys().next();
    if (!oldest.done) glowCache.delete(oldest.value);
  }
  glowCache.set(key, canvas);
  return canvas;
}

/** 绘制柔光（像素台阶，非平滑渐变），strength 0..1 */
export function drawGlow(ctx, cx, cy, radius, color, strength = 1) {
  const s = clamp(num(strength, 1), 0, 1);
  if (s <= 0.01) return;
  const img = glowSprite(color, radius);
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = s;
  if (img) {
    const r = (img.width - 1) / 2;
    ctx.drawImage(img, R(cx) - r, R(cy) - r);
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(R(cx), R(cy), 1, 1);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* 基础精灵                                                            */
/* ------------------------------------------------------------------ */

const STAR7 = [
  '...#...',
  '..###..',
  '#######',
  '.#####.',
  '..###..',
  '.##.##.',
  '##...##',
];

/** 7×7 五角星，(cx,cy) 为中心 */
export function drawStar(ctx, cx, cy, scale = 1, color = PLT.gold) {
  const s = Math.max(1, R(scale));
  PX.bitmap(ctx, STAR7, R(cx) - 3 * s, R(cy) - 3 * s, s, { '#': color });
}

/** 十字星光（标题/开奖闪烁） */
export function drawSparkle(ctx, cx, cy, size = 2, color = PLT.goldLight) {
  const s = Math.max(1, R(size));
  const x = R(cx);
  const y = R(cy);
  PX.rect(ctx, x, y - s, 1, s * 2 + 1, color);
  PX.rect(ctx, x - s, y, s * 2 + 1, 1, color);
  if (s >= 2) {
    PX.dot(ctx, x - s, y - s, color);
    PX.dot(ctx, x + s, y - s, color);
    PX.dot(ctx, x - s, y + s, color);
    PX.dot(ctx, x + s, y + s, color);
  }
  PX.dot(ctx, x, y, PLT.white);
}

/** 金币，(cx,cy) 中心，spin 0..1 表示横向翻转（0 为侧立） */
export function drawCoin(ctx, cx, cy, scale = 1, spin = 1) {
  const s = Math.max(1, R(scale));
  const c = R(cx);
  const y = R(cy);
  const rr = 3 * s;
  const hw = Math.max(1, Math.round(rr * clamp(Math.abs(num(spin, 1)), 0.12, 1)));
  for (let dy = -rr; dy <= rr; dy++) {
    const k = Math.sqrt(Math.max(0, rr * rr - dy * dy)) / rr;
    const span = Math.floor(hw * k + 0.3);
    if (span <= 0) continue;
    ctx.fillStyle = dy < 0 ? PLT.goldLight : PLT.gold;
    ctx.fillRect(c - span, y + dy, span * 2 + 1, 1);
  }
  // 方孔
  const holeW = Math.max(1, Math.round(hw * 0.5));
  PX.rect(ctx, c - Math.floor(holeW / 2), y - s, holeW, 2 * s, PLT.redDeep);
  PX.rect(ctx, c - hw + 1, y - s, Math.max(1, Math.round(s * 0.6)), s, PLT.goldLight);
}

/**
 * 红灯笼（含吊绳/金边/流苏/柔光）。
 * (x,y) 为吊挂点；scale 为整数倍；sway 为整体水平偏移；tilt 为每行倾斜（px/行）。
 */
export function drawLantern(ctx, x, y, scale = 1, opts = {}) {
  const s = Math.max(1, R(scale));
  const lit = opts.lit !== false;
  const sway = num(opts.sway, 0);
  const tilt = num(opts.tilt, 0);
  const hang = Math.max(1, R(num(opts.hang, 4) * s));
  const bx = R(x + sway);
  const by = R(y);

  if (lit) {
    const pulse = num(opts.pulse, 0);
    drawGlow(ctx, bx, by + hang + 6 * s, 10 * s, PLT.gold, 0.16 + pulse * 0.12);
  }

  // 吊绳
  PX.rect(ctx, bx, by, Math.max(1, s - 1), hang, PLT.ink);
  // 挂钩
  PX.rect(ctx, bx - s, by + hang, 3 * s, Math.max(1, s - 1), PLT.goldDark);

  const widths = [4, 7, 9, 10, 10, 10, 10, 9, 7, 4];
  let cy = by + hang + s;
  for (let i = 0; i < widths.length; i++) {
    const w = widths[i] * s;
    const shift = R(tilt * i * s);
    const left = bx + shift - Math.floor(w / 2);
    const edge = i === 0 || i === widths.length - 1;
    PX.rect(ctx, left, cy, w, s, edge ? PLT.redDark : PLT.red);
    if (!edge) {
      PX.rect(ctx, left + s, cy, Math.max(1, Math.round(w * 0.14)), s, PLT.redLight);
      PX.rect(ctx, left + w - s, cy, s, s, PLT.redDark);
    }
    cy += s;
  }
  // 上下金环
  PX.rect(ctx, bx - 2 * s, by + hang + s, 5 * s, s, PLT.gold);
  PX.rect(ctx, bx - 2 * s, cy, 5 * s, s, PLT.goldDark);
  // 流苏
  PX.rect(ctx, bx, cy + s, Math.max(1, s), 3 * s, PLT.goldDark);
  PX.rect(ctx, bx - s, cy + 4 * s, 3 * s, Math.max(1, s - 1), PLT.gold);
}

/** 观众剪影，(x,baseY) 为脚底中心 */
export function drawPerson(ctx, x, baseY, scale = 1, opts = {}) {
  const s = Math.max(1, R(scale));
  const col = opts.color || PLT.ink;
  const bx = R(x);
  const base = R(baseY) + R(num(opts.bob, 0));
  // 身体
  PX.rect(ctx, bx - 3 * s, base - 6 * s, 6 * s, 6 * s, col);
  PX.rect(ctx, bx - 4 * s, base - 8 * s, 8 * s, 3 * s, col);
  // 肩膀/手臂
  PX.rect(ctx, bx - 5 * s, base - 7 * s, s, 4 * s, col);
  PX.rect(ctx, bx + 4 * s, base - 7 * s, s, 4 * s, col);
  // 头
  PX.circle(ctx, bx, base - 10 * s, 2 * s, col);
  if (opts.armUp) {
    PX.line(ctx, bx + 4 * s, base - 7 * s, bx + 6 * s, base - 13 * s, col, s);
  }
  if (opts.phone) {
    PX.rect(ctx, bx + 6 * s, base - 14 * s, s, s, PLT.goldLight);
    drawGlow(ctx, bx + 6 * s, base - 14 * s, 3 * s, PLT.goldLight, 0.35);
  }
}

/** 庙宇屋顶剪影：中间屋脊 + 两端翘角 */
export function drawTempleRoof(ctx, cx, topY, halfW, height, color, opts = {}) {
  const rows = Math.max(4, R(height));
  const ridgeHalf = Math.max(2, Math.round(halfW * num(opts.ridge, 0.26)));
  for (let i = 0; i < rows; i++) {
    const p = rows <= 1 ? 0 : i / (rows - 1);
    const half = Math.round(ridgeHalf + (halfW - ridgeHalf) * Math.pow(p, 1.7));
    PX.rect(ctx, cx - half, topY + i, half * 2 + 1, 1, color);
  }
  // 翘角
  PX.rect(ctx, cx - halfW - 2, topY + rows - 3, 2, 4, color);
  PX.rect(ctx, cx + halfW, topY + rows - 3, 2, 4, color);
  // 屋脊高光
  PX.rect(ctx, cx - ridgeHalf, topY, ridgeHalf * 2 + 1, 1, opts.ridgeColor || color);
}

/** 塔（三重檐）剪影 */
export function drawPagoda(ctx, cx, baseY, scale = 1, color = PLT.plum, accent = PLT.orange) {
  const s = Math.max(1, R(scale));
  let y = R(baseY);
  for (let tier = 0; tier < 3; tier++) {
    const halfW = (18 - tier * 4) * s;
    drawTempleRoof(ctx, cx, y - 11 * s, halfW, 6 * s, color, { ridge: 0.34 });
    // 屋身
    PX.rect(ctx, cx - halfW + 3 * s, y - 5 * s, (halfW - 3 * s) * 2, 5 * s, color);
    // 窗火
    if (tier === 0) {
      PX.rect(ctx, cx - s, y - 4 * s, 2 * s, 2 * s, accent);
    }
    y -= 11 * s;
  }
  PX.rect(ctx, cx - s, y - 2 * s, 2 * s, 3 * s, color);
  PX.rect(ctx, cx - 2 * s, y - 3 * s, 4 * s, s, color);
}

/** 跑马灯灯泡，(x,y) 为中心 */
export function drawBulb(ctx, x, y, color, lit = true, size = 2) {
  const s = Math.max(1, R(size));
  const bx = R(x);
  const by = R(y);
  if (lit) drawGlow(ctx, bx, by, 5 * s, color, 0.5);
  PX.rect(ctx, bx - Math.floor(s / 2), by - Math.floor(s / 2), s, s, lit ? color : PLT.bronze);
  if (lit) PX.dot(ctx, bx, by, PLT.goldLight);
}

/* ------------------------------------------------------------------ */
/* 16×16 图标                                                          */
/* ------------------------------------------------------------------ */

const ICON_NAMES = ['gift', 'lantern', 'coin', 'star', 'sound', 'mute', 'back', 'trophy'];

/**
 * 绘制 16×16 图标。默认 (x,y) 为图标包围盒中心；opts.anchor='topleft' 时改为左上角。
 */
export function drawIcon(ctx, name, x, y, scale = 1, opts = {}) {
  const s = Math.max(1, R(scale));
  const anchor = opts.anchor || 'center';
  const ox = anchor === 'topleft' ? R(x) : R(x) - 8 * s;
  const oy = anchor === 'topleft' ? R(y) : R(y) - 8 * s;
  const f = (rx, ry, rw, rh, col) => PX.rect(ctx, ox + rx * s, oy + ry * s, rw * s, rh * s, col);
  const ln = (x0, y0, x1, y1, col, sz = 1) =>
    PX.line(ctx, ox + x0 * s, oy + y0 * s, ox + x1 * s, oy + y1 * s, col, Math.max(1, sz * s));

  switch (name) {
    case 'gift': {
      // 盒盖
      f(2, 4, 12, 1, PLT.goldLight);
      f(2, 5, 12, 2, PLT.goldDark);
      f(3, 5, 10, 1, PLT.gold);
      // 盒身
      f(2, 8, 12, 8, PLT.ink);
      f(3, 9, 10, 6, PLT.red);
      f(3, 9, 10, 1, PLT.redLight);
      f(4, 14, 8, 1, PLT.redDark);
      // 缎带
      f(7, 4, 2, 12, PLT.gold);
      f(7, 4, 1, 12, PLT.goldLight);
      // 蝴蝶结
      f(5, 2, 2, 2, PLT.gold);
      f(2, 3, 3, 2, PLT.goldDark);
      f(9, 2, 2, 2, PLT.gold);
      f(11, 3, 3, 2, PLT.goldDark);
      f(7, 3, 2, 2, PLT.goldLight);
      break;
    }
    case 'lantern': {
      f(7, 0, 2, 2, PLT.goldLight);
      f(8, 2, 1, 2, PLT.ink);
      f(5, 4, 6, 1, PLT.goldDark);
      const widths = [4, 7, 9, 10, 10, 10, 9, 7, 4];
      for (let i = 0; i < widths.length; i++) {
        const w = widths[i];
        const left = 8 - Math.floor(w / 2);
        const edge = i === 0 || i === widths.length - 1;
        f(left, 5 + i, w, 1, edge ? PLT.redDark : PLT.red);
        if (!edge) {
          f(left, 5 + i, 1, 1, PLT.redLight);
          f(left + w - 1, 5 + i, 1, 1, PLT.redDark);
        }
      }
      f(5, 14, 6, 1, PLT.gold);
      f(8, 15, 1, 1, PLT.goldDark);
      break;
    }
    case 'coin': {
      PX.circle(ctx, ox + 8 * s, oy + 8 * s, 6 * s, PLT.goldDark);
      PX.circle(ctx, ox + 8 * s, oy + 8 * s, 5 * s, PLT.gold);
      f(7, 6, 2, 4, PLT.redDeep);
      f(5, 4, 2, 1, PLT.goldLight);
      PX.dot(ctx, ox + 6 * s, oy + 5 * s, PLT.cream);
      break;
    }
    case 'star': {
      drawStar(ctx, ox + 8 * s, oy + 8 * s, 2 * s, PLT.gold);
      break;
    }
    case 'sound': {
      f(2, 6, 2, 4, PLT.cream);
      f(4, 5, 1, 6, PLT.cream);
      f(5, 4, 1, 8, PLT.cream);
      f(8, 6, 1, 4, PLT.goldLight);
      f(9, 5, 1, 6, PLT.goldLight);
      f(10, 6, 1, 4, PLT.goldLight);
      f(11, 5, 1, 6, PLT.goldLight);
      f(12, 4, 1, 8, PLT.goldLight);
      break;
    }
    case 'mute': {
      f(2, 6, 2, 4, PLT.cream);
      f(4, 5, 1, 6, PLT.cream);
      f(5, 4, 1, 8, PLT.cream);
      ln(9, 5, 13, 11, PLT.redLight, 2);
      ln(13, 5, 9, 11, PLT.redLight, 2);
      break;
    }
    case 'back': {
      ln(12, 8, 3, 8, PLT.gold, 2);
      ln(3, 8, 7, 4, PLT.gold, 2);
      ln(3, 8, 7, 12, PLT.gold, 2);
      break;
    }
    case 'trophy': {
      f(5, 2, 6, 1, PLT.goldLight);
      f(4, 3, 8, 5, PLT.gold);
      f(4, 4, 2, 3, PLT.goldLight);
      f(5, 8, 6, 1, PLT.goldDark);
      f(2, 3, 2, 1, PLT.goldDark);
      f(2, 4, 1, 3, PLT.goldDark);
      f(2, 7, 2, 1, PLT.goldDark);
      f(12, 3, 2, 1, PLT.goldDark);
      f(13, 4, 1, 3, PLT.goldDark);
      f(12, 7, 2, 1, PLT.goldDark);
      f(7, 9, 2, 3, PLT.goldDark);
      f(6, 12, 4, 1, PLT.gold);
      f(4, 13, 8, 1, PLT.goldDark);
      break;
    }
    default: {
      // 未知图标：金色菱形占位，避免运行时抛错
      ln(8, 1, 15, 8, PLT.gold, 2);
      ln(15, 8, 8, 15, PLT.gold, 2);
      ln(8, 15, 1, 8, PLT.gold, 2);
      ln(1, 8, 8, 1, PLT.gold, 2);
      break;
    }
  }
}

export const ICONS = ICON_NAMES;
