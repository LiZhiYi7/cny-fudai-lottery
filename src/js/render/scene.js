// 背景场景：庙会夜色（home / stage / finale / admin）。
// 静态层（夜空/星/月/庙檐剪影/地面/灯串）缓存到离屏 canvas，只在场景切换时绘制一次；
// 动态层（灯笼摇摆、雪、观众起伏、星光闪烁、光锥）逐帧绘制，成本很低。

import { VIEW } from './geometry.js';
import { PLT, alpha, mix } from './palette.js';
import {
  PX,
  num,
  clamp,
  drawGlow,
  drawLantern,
  drawPerson,
  drawTempleRoof,
  drawPagoda,
  drawStar,
  drawSparkle,
} from './sprites.js';

const W = VIEW.W;
const H = VIEW.H;

const SCENES = {
  home: {
    dim: 0,
    crowd: 1,
    lanterns: 14,
    moon: { x: 538, y: 44, r: 18 },
    snow: 1,
    sideLanterns: true,
    beams: false,
    festive: false,
  },
  stage: {
    dim: 0.1,
    crowd: 1,
    lanterns: 10,
    moon: { x: 560, y: 38, r: 15 },
    snow: 1,
    sideLanterns: true,
    beams: true,
    festive: false,
  },
  finale: {
    dim: 0.03,
    crowd: 1,
    lanterns: 20,
    moon: { x: 548, y: 42, r: 15 },
    snow: 0.6,
    sideLanterns: false,
    beams: true,
    festive: true,
  },
  admin: {
    dim: 0.52,
    crowd: 0,
    lanterns: 5,
    moon: { x: 520, y: 54, r: 12 },
    snow: 0.35,
    sideLanterns: false,
    beams: false,
    festive: false,
  },
};

function confOf(scene) {
  return SCENES[scene] || SCENES.home;
}

/** 线性同余随机（场景布局必须稳定，不能每帧变） */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const SEEDS = { home: 0x1a2b3c, stage: 0x51ce91, finale: 0x7d00d5, admin: 0x2f2f2f };

/* ------------------------------------------------------------------ */
/* 静态层                                                              */
/* ------------------------------------------------------------------ */

const staticCache = new Map();

const SKY_STOPS = [
  [0, PLT.void],
  [0.16, PLT.night],
  [0.42, PLT.night2],
  [0.66, PLT.plum],
  [0.86, mix(PLT.plum, PLT.redDeep, 0.45)],
  [1, mix(PLT.redDeep, PLT.orange, 0.22)],
];

function sampleStops(p) {
  const q = clamp(p, 0, 1);
  for (let i = 0; i < SKY_STOPS.length - 1; i++) {
    const p0 = SKY_STOPS[i][0];
    const p1 = SKY_STOPS[i + 1][0];
    if (q <= p1) {
      const k = (q - p0) / Math.max(0.0001, p1 - p0);
      return mix(SKY_STOPS[i][1], SKY_STOPS[i + 1][1], k);
    }
  }
  return SKY_STOPS[SKY_STOPS.length - 1][1];
}

const HORIZON = 252;

function drawSky(g, scene) {
  const conf = confOf(scene);
  const band = 6;
  for (let y = 0; y < HORIZON; y += band) {
    const p = y / HORIZON;
    PX.rect(g, 0, y, W, band, sampleStops(p));
    // 段间 1px 棋盘抖动，避免大面积色带过于生硬
    if (y + band < HORIZON) {
      const c1 = sampleStops(p);
      const c2 = sampleStops((y + band) / HORIZON);
      for (let x = 0; x < W; x += 2) {
        PX.rect(g, x, y + band - 2, 1, 2, c1);
        PX.rect(g, x + 1, y + band - 2, 1, 2, c2);
      }
    }
  }
  // 地平线暖光（庙会灯火）
  drawGlow(g, W / 2, HORIZON - 6, 210, PLT.orange, 0.16);
  drawGlow(g, 90, HORIZON - 20, 110, PLT.red, 0.14);
  drawGlow(g, W - 80, HORIZON - 26, 100, PLT.gold, 0.12);
  if (conf.festive) {
    drawGlow(g, W / 2, 150, 190, PLT.gold, 0.09);
  }
}

function drawStars(g, scene) {
  const rnd = rng(SEEDS[scene] || 7);
  const colors = [PLT.cream, PLT.white, PLT.goldLight, PLT.cyan, PLT.cream];
  for (let i = 0; i < 150; i++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(8 + rnd() * 186);
    const a = 0.25 + rnd() * 0.65;
    const col = colors[Math.floor(rnd() * colors.length)];
    if (rnd() < 0.1) {
      PX.rectA(g, x, y, 2, 2, col, a * 0.9);
      PX.dot(g, x + 1, y + 1, PLT.white);
    } else {
      PX.rectA(g, x, y, 1, 1, col, a);
    }
  }
  // 少量大星带十字光
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(40 + rnd() * (W - 80));
    const y = Math.floor(20 + rnd() * 130);
    drawStar(g, x, y, 1, PLT.cream);
    PX.rectA(g, x - 3, y, 7, 1, PLT.cream, 0.35);
  }
}

function drawMoon(g, moon) {
  const { x, y, r } = moon;
  if (!r) return;
  drawGlow(g, x, y, Math.round(r * 3.4), PLT.cream, 0.2);
  drawGlow(g, x, y, Math.round(r * 1.8), PLT.goldLight, 0.18);
  PX.circle(g, x, y, r, PLT.cream);
  PX.circle(g, x - Math.round(r * 0.2), y - Math.round(r * 0.15), Math.round(r * 0.86), PLT.goldLight);
  // 环形山
  PX.circle(g, x + Math.round(r * 0.32), y + Math.round(r * 0.2), Math.max(1, Math.round(r * 0.2)), mix(PLT.goldLight, PLT.plum, 0.22));
  PX.circle(g, x - Math.round(r * 0.35), y + Math.round(r * 0.42), Math.max(1, Math.round(r * 0.14)), mix(PLT.goldLight, PLT.plum, 0.18));
  PX.circle(g, x + Math.round(r * 0.05), y - Math.round(r * 0.42), Math.max(1, Math.round(r * 0.1)), mix(PLT.goldLight, PLT.plum, 0.16));
  // 月面边缘像素描边
  PX.circleOutline(g, x, y, r, mix(PLT.cream, PLT.plum, 0.28), 1);
}

function drawSkyline(g, scene) {
  const rnd = rng((SEEDS[scene] || 11) ^ 0x9e37);
  const far = mix(PLT.night2, PLT.ink, 0.5);
  const near = PLT.ink2;
  const darkest = PLT.ink;

  // 远层：塔 + 连绵屋脊
  drawPagoda(g, 86, 240, 2, far, PLT.orange);
  drawTempleRoof(g, 206, 212, 54, 12, far, { ridge: 0.32 });
  drawTempleRoof(g, 470, 206, 120, 20, far, { ridge: 0.28 });
  PX.rect(g, 414, 224, 112, 22, far);
  PX.rect(g, 180, 222, 52, 24, far);

  // 近层：庙宇剪影 + 屋身
  drawTempleRoof(g, 300, 218, 92, 18, near, { ridge: 0.24 });
  PX.rect(g, 232, 234, 136, 20, near);
  drawTempleRoof(g, 78, 230, 46, 12, near, { ridge: 0.3 });
  PX.rect(g, 44, 240, 68, 16, near);
  drawTempleRoof(g, 560, 226, 70, 15, near, { ridge: 0.3 });
  PX.rect(g, 508, 239, 104, 18, near);

  // 庙会窗火与沿街灯
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(30 + rnd() * (W - 60));
    const y = Math.floor(226 + rnd() * 20);
    const warm = rnd() < 0.7 ? PLT.gold : PLT.orange;
    PX.rectA(g, x, y, 2, 2, warm, 0.45 + rnd() * 0.4);
    if (rnd() < 0.3) drawGlow(g, x + 1, y + 1, 6, warm, 0.25);
  }
  // 屋檐下成排小灯
  for (let i = 0; i < 22; i++) {
    const x = Math.floor(40 + rnd() * (W - 80));
    const y = Math.floor(238 + rnd() * 8);
    PX.dot(g, x, y, PLT.redLight);
  }
  // 远景灯笼点点
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(20 + rnd() * (W - 40));
    const y = Math.floor(198 + rnd() * 26);
    PX.rect(g, x, y, 2, 2, PLT.red);
    PX.dot(g, x, y + 2, PLT.goldDark);
  }
  // 远处霾带，压暗建筑底部
  PX.rectA(g, 0, 238, W, 8, darkest, 0.35);
}

function drawGround(g, scene) {
  const conf = confOf(scene);
  const base = mix(PLT.ink, PLT.night, 0.28);
  PX.rect(g, 0, HORIZON, W, H - HORIZON, base);
  // 广场反光带
  PX.dither(g, 0, HORIZON, W, 22, base, mix(base, PLT.plum, 0.35), 2);
  PX.rect(g, 0, HORIZON + 22, W, 2, mix(PLT.plum, PLT.orange, 0.12));

  // 石板缝 + 暖色反光
  const rnd = rng((SEEDS[scene] || 3) ^ 0x51ed);
  for (let i = 0; i < 40; i++) {
    const x = Math.floor(rnd() * W);
    const y = Math.floor(HORIZON + 8 + rnd() * 88);
    if (rnd() < 0.55) PX.rectA(g, x, y, 4 + Math.floor(rnd() * 10), 1, PLT.ink, 0.5);
  }
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(20 + rnd() * (W - 40));
    const y = Math.floor(HORIZON + 14 + rnd() * 76);
    const warm = rnd() < 0.5 ? PLT.goldDark : PLT.orange;
    PX.rectA(g, x, y, 2, 5, warm, 0.16 + rnd() * 0.14);
  }
  // 前景压暗
  PX.rectA(g, 0, 316, W, H - 316, PLT.void, 0.45);
  if (conf.festive) {
    PX.rectA(g, 0, HORIZON, W, 40, PLT.goldDark, 0.05);
  }
  // 底部暗边
  PX.rectA(g, 0, H - 3, W, 3, PLT.void, 0.6);
}

function drawVignette(g) {
  const edge = 26;
  for (let i = 0; i < edge; i += 2) {
    const a = (1 - i / edge) * 0.12;
    PX.rectA(g, i, 0, 2, H, PLT.void, a);
    PX.rectA(g, W - i - 2, 0, 2, H, PLT.void, a);
  }
  for (let i = 0; i < 12; i += 2) {
    const a = (1 - i / 12) * 0.1;
    PX.rectA(g, 0, i, W, 2, PLT.void, a);
    PX.rectA(g, 0, H - i - 2, W, 2, PLT.void, a);
  }
}

function drawLightBeams(g, scene) {
  const conf = confOf(scene);
  if (!conf.beams) return;
  // 两条从顶部斜下的柔光柱（用竖直渐变条模拟，边缘像素化）
  for (let i = 0; i < 2; i++) {
    const cx = i === 0 ? 130 : W - 130;
    for (let y = 0; y < 300; y += 6) {
      const half = 14 + Math.floor(y * 0.16);
      const a = (1 - y / 320) * 0.05;
      PX.rectA(g, cx - half, y, half * 2, 6, PLT.goldLight, a);
    }
  }
}

function drawGarland(g, scene, list) {
  const top = list.filter((l) => !l.big);
  for (let i = 0; i < top.length - 1; i++) {
    PX.line(g, top[i].x, top[i].y, top[i + 1].x, top[i + 1].y, PLT.ink, 1);
  }
  // 灯串上的小穗子
  for (let i = 0; i < top.length; i++) {
    PX.dot(g, top[i].x, top[i].y + 2, PLT.goldDark);
  }
}

function buildStatic(scene) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.imageSmoothingEnabled = false;
  drawSky(g, scene);
  drawStars(g, scene);
  drawMoon(g, confOf(scene).moon);
  drawSkyline(g, scene);
  drawGround(g, scene);
  drawGarland(g, scene, lanternLayout(scene));
  drawLightBeams(g, scene);
  drawVignette(g);
  return canvas;
}

function getStatic(scene) {
  const key = SEEDS[scene] ? scene : 'home';
  if (staticCache.has(key)) return staticCache.get(key);
  if (typeof document === 'undefined') return null;
  const canvas = buildStatic(key);
  staticCache.set(key, canvas);
  return canvas;
}

/* ------------------------------------------------------------------ */
/* 场景布局（灯笼/雪/观众，确定性）                                    */
/* ------------------------------------------------------------------ */

const lanternCache = new Map();
const snowCache = new Map();
const crowdCache = new Map();
const skyLanternCache = new Map();

/** 孔明灯：缓慢上升的暖色光点（首页/终场天空的空隙装饰） */
function skyLanternLayout(scene) {
  const key = SEEDS[scene] ? scene : 'home';
  if (skyLanternCache.has(key)) return skyLanternCache.get(key);
  if (key === 'stage' || key === 'admin') {
    skyLanternCache.set(key, []);
    return [];
  }
  const rnd = rng((SEEDS[key] || 61) ^ 0x2b2b);
  const n = key === 'finale' ? 9 : 6;
  const list = [];
  for (let i = 0; i < n; i++) {
    list.push({
      x0: rnd() * W,
      y0: rnd() * (H + 80),
      speed: 3 + rnd() * 6,
      size: rnd() < 0.3 ? 2 : 1,
      phase: rnd() * Math.PI * 2,
    });
  }
  skyLanternCache.set(key, list);
  return list;
}

function lanternLayout(scene) {
  const key = SEEDS[scene] ? scene : 'home';
  if (lanternCache.has(key)) return lanternCache.get(key);
  const conf = confOf(key);
  const rnd = rng((SEEDS[key] || 21) ^ 0x00aa);
  const list = [];
  const n = conf.lanterns;
  for (let i = 0; i < n; i++) {
    const x = Math.round(18 + ((W - 36) * (i + 0.5)) / n + (rnd() - 0.5) * 8);
    const sag = Math.sin((x / W) * Math.PI) * 30;
    const y = Math.round(16 + sag);
    list.push({
      x,
      y,
      hang: 3 + Math.round(rnd() * 7),
      scale: 1,
      phase: rnd() * Math.PI * 2,
      speed: 0.6 + rnd() * 0.7,
      amp: 1 + rnd() * 2.2,
      lit: true,
      big: false,
    });
  }
  if (conf.sideLanterns) {
    list.push({
      x: 26,
      y: 228,
      hang: 8,
      scale: 2,
      phase: 1.1,
      speed: 0.5,
      amp: 1.4,
      lit: true,
      big: true,
      ropeTop: 150,
    });
    list.push({
      x: W - 26,
      y: 212,
      hang: 8,
      scale: 2,
      phase: 3.7,
      speed: 0.56,
      amp: 1.4,
      lit: true,
      big: true,
      ropeTop: 132,
    });
  }
  lanternCache.set(key, list);
  return list;
}

function snowLayout(scene) {
  const key = SEEDS[scene] ? scene : 'home';
  if (snowCache.has(key)) return snowCache.get(key);
  const conf = confOf(key);
  const rnd = rng((SEEDS[key] || 31) ^ 0x5f0a);
  const count = Math.round(72 * conf.snow);
  const list = [];
  for (let i = 0; i < count; i++) {
    list.push({
      x0: rnd() * W,
      y0: rnd() * H,
      speed: 10 + rnd() * 24,
      drift: 3 + rnd() * 9,
      size: rnd() < 0.18 ? 2 : 1,
      a: 0.3 + rnd() * 0.5,
      phase: rnd() * Math.PI * 2,
    });
  }
  snowCache.set(key, list);
  return list;
}

function crowdLayout(scene) {
  const key = SEEDS[scene] ? scene : 'home';
  if (crowdCache.has(key)) return crowdCache.get(key);
  const rnd = rng((SEEDS[key] || 41) ^ 0xc0de);
  const list = [];
  const rows = 26;
  for (let i = 0; i < rows; i++) {
    const x = Math.round(-12 + ((W + 24) * (i + 0.5)) / rows + (rnd() - 0.5) * 18);
    const lay = rnd();
    const scale = lay < 0.42 ? 2 : 1;
    const base = Math.round(324 + rnd() * 32 + (scale === 2 ? 6 : 0));
    list.push({
      x,
      base,
      scale,
      phase: rnd() * Math.PI * 2,
      armUp: rnd() < 0.16,
      phone: rnd() < 0.2,
      warm: rnd(),
    });
  }
  list.sort((a, b) => a.base - b.base);
  crowdCache.set(key, list);
  return list;
}

/* ------------------------------------------------------------------ */
/* 动态层                                                              */
/* ------------------------------------------------------------------ */

function drawStarTwinkle(ctx, scene, t) {
  const rnd = rng((SEEDS[scene] || 5) ^ 0x7fa3);
  for (let i = 0; i < 18; i++) {
    const x = Math.floor(20 + rnd() * (W - 40));
    const y = Math.floor(10 + rnd() * 150);
    const sp = 0.6 + rnd() * 1.8;
    const ph = rnd() * Math.PI * 2;
    const k = Math.sin(t * sp + ph);
    if (k > 0.55) {
      PX.rectA(ctx, x, y, 1, 1, PLT.white, 0.35 + k * 0.4);
      if (k > 0.94) drawSparkle(ctx, x, y, 1, PLT.goldLight);
    }
  }
}

function drawSkyLanterns(ctx, scene, t) {
  const list = skyLanternLayout(scene);
  if (!list.length) return;
  const span = H + 80;
  for (let i = 0; i < list.length; i++) {
    const L = list[i];
    const y = ((((L.y0 - t * L.speed) % span) + span) % span) - 40;
    const x = ((((L.x0 + Math.sin(t * 0.4 + L.phase) * 10) % W) + W) % W);
    if (y < -20 || y > H + 10) continue;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.3 + L.phase);
    drawGlow(ctx, x, y, 8 * L.size, PLT.orange, 0.16 + pulse * 0.14);
    PX.rect(ctx, x - L.size, y - L.size, 3 * L.size, 3 * L.size, PLT.gold);
    PX.rect(ctx, x - L.size, y + L.size, 3 * L.size, 1, PLT.goldDark);
    PX.dot(ctx, x, y - 1, PLT.goldLight);
  }
}

function drawLanterns(ctx, scene, t, opts) {
  const list = lanternLayout(scene);
  for (let i = 0; i < list.length; i++) {
    const L = list[i];
    const sway = Math.sin(t * L.speed + L.phase) * L.amp;
    const pulse = 0.5 + 0.5 * Math.sin(t * 1.9 + L.phase);
    if (L.big) {
      // 从顶部垂下的长绳
      PX.rect(ctx, L.x, 0, 1, L.y, PLT.ink);
    }
    drawLantern(ctx, L.x, L.y, L.scale, {
      sway,
      tilt: sway * 0.06,
      hang: L.hang,
      lit: L.lit,
      pulse,
    });
  }
  // 首页/终场：画面两侧再点缀几颗漂浮光点
  if (opts && opts.extraGlow) {
    for (let i = 0; i < 6; i++) {
      const x = (i * 97 + 40) % W;
      const y = 120 + ((i * 53) % 140) + Math.sin(t * 0.8 + i) * 4;
      drawGlow(ctx, x, y, 12, PLT.gold, 0.12);
    }
  }
}

function drawSnow(ctx, scene, t) {
  const flakes = snowLayout(scene);
  for (let i = 0; i < flakes.length; i++) {
    const f = flakes[i];
    const y = ((f.y0 + t * f.speed) % (H + 8)) - 4;
    const x = (((f.x0 + t * f.drift + Math.sin(t * 0.9 + f.phase) * 5) % W) + W) % W;
    if (y < 0) continue;
    if (f.size === 2) {
      PX.rectA(ctx, x, y, 2, 2, PLT.cream, f.a * 0.9);
      PX.dot(ctx, x, y, PLT.white);
    } else {
      PX.rectA(ctx, x, y, 1, 1, PLT.cream, f.a);
    }
  }
}

function drawCrowd(ctx, t) {
  const list = crowdLayout('home');
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    const bob = Math.sin(t * 1.5 + p.phase) * 1;
    const col = p.warm > 0.72 ? mix(PLT.ink, PLT.plum, 0.35) : PLT.ink;
    drawPerson(ctx, p.x, p.base, p.scale, {
      color: col,
      bob,
      armUp: p.armUp,
      phone: p.phone,
    });
    // 头顶一点环境反光，避免纯黑糊成一片
    PX.rectA(ctx, p.x - p.scale, p.base + Math.round(bob) - 12 * p.scale, 2 * p.scale, 1, mix(PLT.plum, PLT.orange, 0.3), 0.7);
  }
}

/* ------------------------------------------------------------------ */
/* 对外入口                                                            */
/* ------------------------------------------------------------------ */

/**
 * Art.background 的实际实现。
 * @param {CanvasRenderingContext2D} ctx
 * @param {'home'|'stage'|'finale'|'admin'} scene
 * @param {number} t 秒
 * @param {{dim?:number, extraGlow?:boolean, snow?:boolean}} [opts]
 */
export function drawBackground(ctx, scene = 'home', t = 0, opts = {}) {
  const key = SEEDS[scene] ? scene : 'home';
  const conf = confOf(key);
  const tt = num(t, 0);
  const o = opts || {};

  const staticCanvas = getStatic(key);
  if (staticCanvas) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(staticCanvas, 0, 0);
  } else {
    PX.rect(ctx, 0, 0, W, H, PLT.night);
  }

  drawStarTwinkle(ctx, key, tt);
  drawSkyLanterns(ctx, key, tt);
  drawLanterns(ctx, key, tt, o);
  if (conf.crowd && o.crowd !== false) drawCrowd(ctx, tt);
  if (conf.snow && o.snow !== false) drawSnow(ctx, key, tt);
  if (conf.dim > 0) PX.rectA(ctx, 0, 0, W, H, PLT.void, conf.dim);
  const od = clamp(num(o.dim, 0), 0, 1);
  if (od > 0) PX.rectA(ctx, 0, 0, W, H, PLT.void, od);
}

/** 仅供沙盒/调试：强制重建所有背景缓存 */
export function invalidateBackgrounds() {
  staticCache.clear();
  lanternCache.clear();
  snowCache.clear();
  crowdCache.clear();
  skyLanternCache.clear();
}

export const Scene = { drawBackground, invalidateBackgrounds, SCENES };
