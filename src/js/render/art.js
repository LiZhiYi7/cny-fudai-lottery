// 像素美术主体：春节庙会夜 · 抓娃娃机。
// 全部由 Canvas 2D 整数矩形 / 布里森汉姆线段 / 逐行圆绘制，无外部图片、无抗锯齿、无字体文件。
// 中文一律走 Txt，数字优先 Txt.digits。

import { VIEW, MACHINE, CLAW_RANGE } from './geometry.js';
import { PLT, shade, mix } from './palette.js';
import { Txt } from './text.js';
import { drawBackground } from './scene.js';
import {
  PX,
  num,
  clamp,
  drawGlow,
  drawStar,
  drawSparkle,
  drawIcon,
} from './sprites.js';

const W = VIEW.W;
const H = VIEW.H;
const M = MACHINE;

/* 玻璃内框（与 MACHINE 常量对齐） */
const GX = M.innerLeft; // 88
const GW = M.innerRight - M.innerLeft; // 464
const GY = 114;
const GH = M.floorY - GY; // 178，底部 292
const RAIL_Y = 117;
const FLOOR = M.floorY; // 292
const GLASS_CX = GX + GW / 2; // 320

/* ------------------------------------------------------------------ */
/* 小工具                                                              */
/* ------------------------------------------------------------------ */

function frac(v, def = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? clamp(n, 0, 1) : def;
}

function hashId(id) {
  const s = String(id == null ? '' : id);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

function diffValue(d) {
  if (typeof d === 'number' && Number.isFinite(d)) return clamp(Math.round(d), 0, 4);
  const map = {
    easy: 1,
    normal: 2,
    hard: 3,
    extreme: 4,
    简单: 1,
    普通: 2,
    困难: 3,
    地狱: 4,
    极难: 4,
  };
  const v = map[String(d)];
  return v === undefined ? 2 : v;
}

const DEFAULT_POUCHES = [
  { id: 'd1', x: 132, gold: false },
  { id: 'd2', x: 192, gold: false },
  { id: 'd3', x: 252, gold: false },
  { id: 'd4', x: 320, gold: true },
  { id: 'd5', x: 386, gold: false },
  { id: 'd6', x: 446, gold: false },
  { id: 'd7', x: 506, gold: false },
];

/** 归一化 state.pouches，缺字段 / 半成品状态一律兜底 */
function resolvePouches(state) {
  const raw = Array.isArray(state && state.pouches) ? state.pouches : null;
  const goldId = state && state.goldId != null ? String(state.goldId) : '';
  const grabId = state && state.grab && state.grab.id != null ? String(state.grab.id) : '';
  let src;
  if (raw && raw.length) src = raw;
  else if (raw && !raw.length) {
    // 显式空数组：仅在 idle 时补默认福袋，避免开场空机器
    const phase = state && state.phase ? String(state.phase) : 'idle';
    src = state && state.grab ? [] : phase === 'idle' ? DEFAULT_POUCHES : [];
  } else src = DEFAULT_POUCHES;

  const out = [];
  for (let i = 0; i < src.length; i++) {
    const item = src[i] || {};
    const def = DEFAULT_POUCHES[i] || { x: GLASS_CX, gold: false };
    const id = item.id != null ? String(item.id) : 'p' + i;
    const held = !!grabId && id === grabId;
    const gold = item.gold === true || goldId === id || (!raw && def.gold === true);
    out.push({
      id,
      x: clamp(num(item.x, def.x), GX - 6, GX + GW + 6),
      // 被爪子夹住的福袋由游戏逐帧给出 clawY+20 的坐标，不能再叠加 lift 位移
      y: clamp(num(item.y, FLOOR), GY + 24, FLOOR + 8),
      gold,
      open: frac(item.open, 0),
      lift: held ? 0 : frac(item.lift, 0),
      scale: clamp(num(item.scale, 1), 0.45, 1.9),
      wobble: clamp(num(item.wobble, 0), 0, 2),
      held,
    });
  }
  out.sort((a, b) => a.y - b.y || a.x - b.x);
  return out;
}

/* ------------------------------------------------------------------ */
/* 福袋                                                                */
/* ------------------------------------------------------------------ */

/**
 * 绘制一个福袋；(x, y) 中 y 为袋底基线。
 * opts: {id, x, y, gold, open, lift, scale, wobble}
 */
function drawPouch(ctx, opts, t) {
  const o = opts || {};
  const gold = o.gold === true;
  const baseW = gold ? M.goldBaseW : M.pouchBaseW;
  const baseH = gold ? M.goldBaseH : M.pouchBaseH;
  const sc = clamp(num(o.scale, 1), 0.45, 1.9);
  const w = Math.max(8, Math.round(baseW * sc));
  const h = Math.max(10, Math.round(baseH * sc));
  const open = frac(o.open, 0);
  const lift = frac(o.lift, 0);
  const wobble = clamp(num(o.wobble, 0), 0, 2);
  const seed = hashId(o.id);
  const tt = num(t, 0);

  const floatY = gold ? Math.sin(tt * 2 + seed * 6.28) * 1.5 : Math.sin(tt * 1.6 + seed * 4) * 0.6;
  const bottom = num(o.y, FLOOR) - lift * 10 + floatY;
  const cx = Math.round(num(o.x, GLASS_CX) + Math.sin(tt * 8 + seed * 6.28) * wobble * 3);
  const by = Math.round(bottom);
  const top = by - h;

  // 地面投影（被夹起到高处时不画，避免地面上出现孤立阴影）
  if (by > FLOOR - 40) {
    const shadowW = Math.round(w * 0.8 * (1 - lift * 0.4));
    PX.rectA(ctx, cx - shadowW / 2, FLOOR - 2, shadowW, 2, PLT.void, 0.4);
  }

  // 金色福袋光晕
  if (gold) {
    const pulse = 0.5 + 0.5 * Math.sin(tt * 2.4 + seed * 6.28);
    drawGlow(ctx, cx, by - h * 0.55, Math.round(w * 0.95), PLT.gold, 0.2 + pulse * 0.12);
  }

  const hi = gold ? PLT.goldLight : PLT.redLight;
  const sh = gold ? PLT.goldDark : PLT.redDark;
  const body = gold ? PLT.gold : PLT.red;

  // 袋身：束口 → 鼓腹 → 圆底
  for (let i = 0; i < h; i++) {
    const v = h <= 1 ? 0 : i / (h - 1);
    let k;
    if (v < 0.18) k = 0.4 + (v / 0.18) * 0.3;
    else if (v < 0.38) k = 0.7 + ((v - 0.18) / 0.2) * 0.3;
    else if (v > 0.9) k = 1 - ((v - 0.9) / 0.1) * 0.26;
    else k = 1;
    const rw = Math.max(4, Math.round(w * k));
    const left = cx - Math.floor(rw / 2);
    // 统一的 1px 深色描边（像素台阶侧边 + 首末行封口）
    PX.rect(ctx, left - 1, top + i, 1, 1, PLT.ink);
    PX.rect(ctx, left + rw, top + i, 1, 1, PLT.ink);
    if (i === 0) PX.rect(ctx, left - 1, top - 1, rw + 2, 1, PLT.ink);
    if (i === h - 1) PX.rect(ctx, left - 1, top + h, rw + 2, 1, PLT.ink);
    PX.rect(ctx, left, top + i, rw, 1, body);
    PX.rect(ctx, left + 1, top + i, Math.max(1, Math.round(rw * 0.16)), 1, hi);
    if (rw > 4) PX.rect(ctx, left + rw - 1, top + i, 1, 1, sh);
    if (v > 0.94) PX.rect(ctx, left + 1, top + i, rw - 2, 1, sh);
  }

  // 金色抽绳 + 束口
  const neckW = Math.max(5, Math.round(w * 0.62));
  const neckY = top + Math.round(h * 0.17);
  PX.rect(ctx, cx - Math.round(neckW / 2), neckY, neckW, 1, gold ? PLT.goldDark : PLT.gold);
  PX.rect(ctx, cx - Math.round(neckW / 2), neckY + 1, neckW, 1, gold ? PLT.bronze : PLT.goldDark);

  // 抽绳蝴蝶结
  const knotY = neckY - 2;
  PX.rect(ctx, cx - 1, knotY, 2, 3, PLT.goldLight);
  PX.rect(ctx, cx - 4, knotY + 1, 3, 1, PLT.gold);
  PX.rect(ctx, cx + 2, knotY + 1, 3, 1, PLT.gold);

  // 袋口开启：暗口 + 翻边 + 光柱 + 星光
  if (open > 0.02) {
    const gapW = Math.max(2, Math.round(neckW * 0.38 + open * w * 0.2));
    PX.rect(ctx, cx - Math.floor(gapW / 2), top + 1, gapW, Math.max(2, Math.round(2 + open * 4)), PLT.redDeep);
    PX.rect(ctx, cx - Math.round(w * 0.34), top + 2, Math.round(w * 0.14), 2, gold ? PLT.goldLight : PLT.redLight);
    PX.rect(ctx, cx + Math.round(w * 0.2), top + 2, Math.round(w * 0.14), 2, gold ? PLT.goldLight : PLT.redLight);
    const beamH = Math.round(26 * open);
    for (let i = 0; i < beamH; i += 2) {
      const half = 2 + i * 0.32;
      PX.rectA(ctx, cx - half, top - 2 - i, half * 2, 2, PLT.goldLight, 0.22 * open * (1 - i / Math.max(1, beamH)));
    }
    const sp = Math.sin(tt * 6 + seed * 6.28);
    drawSparkle(ctx, cx + Math.round(sp * 7), top - 6 - Math.round(open * 8), 2, PLT.goldLight);
  }

  // 福字
  const fs = Math.max(8, Math.round(h * 0.4));
  Txt.draw(ctx, '福', cx, by - Math.round(h * 0.56), {
    size: fs,
    color: gold ? PLT.redDeep : PLT.goldLight,
    align: 'center',
    valign: 'middle',
    outline: 1,
    outlineColor: gold ? PLT.goldLight : PLT.redDeep,
    alpha: 0.96,
  });

  // 高光
  PX.rectA(ctx, cx - Math.round(w * 0.3), top + Math.round(h * 0.36), 2, Math.max(3, Math.round(h * 0.2)), PLT.white, gold ? 0.3 : 0.22);
  PX.dot(ctx, cx - Math.round(w * 0.28), top + Math.round(h * 0.3), PLT.white);

  // 金福袋环绕星光
  if (gold) {
    for (let i = 0; i < 3; i++) {
      const a = tt * 1.3 + i * 2.1 + seed * 6.28;
      const sx = cx + Math.cos(a) * w * 0.62;
      const sy = by - h * 0.55 + Math.sin(a) * h * 0.42;
      const on = 0.5 + 0.5 * Math.sin(tt * 4 + i * 2.2);
      if (on > 0.35) drawSparkle(ctx, sx, sy, on > 0.8 ? 2 : 1, PLT.goldLight);
    }
  }

  return { cx, by, top, w, h };
}

/* ------------------------------------------------------------------ */
/* 娃娃机：部件                                                         */
/* ------------------------------------------------------------------ */

function drawCabinetBase(ctx, t) {
  const { x, y, w, h } = M;
  // 外描边 + 金色机身
  PX.rect(ctx, x, y, w, h, PLT.ink);
  PX.rect(ctx, x + 1, y + 1, w - 2, h - 2, PLT.bronze);
  PX.rect(ctx, x + 2, y + 2, w - 4, h - 4, PLT.goldDark);
  PX.rect(ctx, x + 3, y + 3, w - 6, h - 6, PLT.gold);
  PX.rect(ctx, x + 4, y + 4, w - 8, h - 8, PLT.redDark);

  // 机身明暗
  PX.rect(ctx, x + 4, y + 4, w - 8, 2, mix(PLT.red, PLT.redLight, 0.35));
  PX.rect(ctx, x + 4, y + 4, 3, h - 8, mix(PLT.red, PLT.redLight, 0.22));
  PX.rect(ctx, x + w - 8, y + 4, 4, h - 8, PLT.redDeep);
  PX.rect(ctx, x + 4, y + h - 9, w - 8, 5, PLT.redDeep);
  // 机身细纹
  for (let i = 0; i < 6; i++) {
    PX.rectA(ctx, x + 10 + i * 4, y + 5, 1, 2, PLT.goldDark, 0.35);
    PX.rectA(ctx, x + w - 14 - i * 4, y + 5, 1, 2, PLT.goldDark, 0.35);
  }

  // 招牌外框（顶部 24px 灯箱）
  const sx = x + 74;
  const sw = w - 148;
  const sy = y + 2;
  const sh = 17;
  PX.rect(ctx, sx, sy, sw, sh, PLT.ink);
  PX.rect(ctx, sx + 1, sy + 1, sw - 2, sh - 2, PLT.goldDark);
  PX.rect(ctx, sx + 2, sy + 2, sw - 4, sh - 4, PLT.redDeep);
  PX.rectA(ctx, sx + 4, sy + 3, sw - 8, 1, PLT.redLight, 0.4);

  // 玻璃外框
  PX.rect(ctx, GX - 4, GY - 4, GW + 8, GH + 8, PLT.ink);
  PX.rect(ctx, GX - 3, GY - 3, GW + 6, GH + 6, PLT.bronze);
  PX.rect(ctx, GX - 2, GY - 2, GW + 4, GH + 4, PLT.goldDark);
  PX.rect(ctx, GX - 1, GY - 1, GW + 2, GH + 2, PLT.ink);

  // 底部机柜面板
  const py = FLOOR + 6;
  const ph = M.y + M.h - py - 4;
  PX.rect(ctx, x + 12, py, w - 24, ph, PLT.redDeep);
  PX.rect(ctx, x + 12, py, w - 24, 1, PLT.goldDark);
  PX.rectA(ctx, x + 14, py + 2, w - 28, 1, PLT.red, 0.35);

  // 取物口
  const chuteX = x + 64;
  const chuteY = py + 3;
  PX.rect(ctx, chuteX, chuteY, 74, ph - 6, PLT.ink);
  PX.rect(ctx, chuteX + 1, chuteY + 1, 72, ph - 8, PLT.void);
  PX.rect(ctx, chuteX + 1, chuteY + 1, 72, 1, PLT.greyDark);

  // 投币口
  const slotX = x + w - 142;
  const slotY = py + 3;
  PX.rect(ctx, slotX, slotY, 42, ph - 6, PLT.goldDark);
  PX.rect(ctx, slotX + 1, slotY + 1, 40, ph - 8, PLT.ink2);
  PX.rect(ctx, slotX + 12, slotY + 2, 3, ph - 10, PLT.void);
  PX.rect(ctx, slotX + 13, slotY + 2, 1, ph - 10, PLT.greyDark);
  PX.rect(ctx, slotX + 22, slotY + 2, 14, 2, PLT.gold);

  // 喇叭孔
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      PX.rectA(ctx, x + w - 74 + j * 5, py + 3 + i * 3, 2, 2, PLT.greyDark, 0.8);
    }
  }

  // 中控小按钮 + 散热格栅，充实底部机柜
  for (let i = 0; i < 3; i++) {
    const bx = x + 214 + i * 16;
    const by = py + 3;
    PX.rect(ctx, bx, by, 6, 6, PLT.ink);
    PX.rect(ctx, bx + 1, by + 1, 4, 4, i === 0 ? PLT.gold : i === 1 ? PLT.redLight : PLT.goldDark);
    PX.dot(ctx, bx + 1, by + 1, PLT.cream);
  }
  for (let i = 0; i < 3; i++) {
    PX.rectA(ctx, x + w - 214, py + 4 + i * 3, 18, 1, PLT.greyDark, 0.8);
  }

  // 底部灯槽
  PX.rect(ctx, x + 10, M.y + M.h - 6, w - 20, 4, PLT.ink);
}

function drawGlassBack(ctx, state, t) {
  // 内部底色（上暗下暖）
  const bands = 10;
  for (let i = 0; i < bands; i++) {
    const y0 = GY + Math.round((GH * i) / bands);
    const y1 = GY + Math.round((GH * (i + 1)) / bands);
    PX.rect(ctx, GX, y0, GW, y1 - y0, mix(PLT.night, PLT.ink, (i / (bands - 1)) * 0.75));
  }
  // 背板大福字水印
  Txt.draw(ctx, '福', GLASS_CX, GY + Math.round(GH * 0.4), {
    size: 92,
    color: PLT.plum,
    align: 'center',
    valign: 'middle',
    alpha: 0.38,
  });

  // 背部灯串
  for (let i = 0; i < 15; i++) {
    const bx = GX + 18 + i * 30;
    const on = Math.sin(t * 2.2 + i * 0.7) > -0.2;
    if (on) {
      PX.rect(ctx, bx, GY + 12, 2, 2, PLT.goldLight);
      drawGlow(ctx, bx + 1, GY + 13, 6, PLT.gold, 0.22);
    } else {
      PX.rect(ctx, bx, GY + 12, 2, 2, PLT.bronze);
    }
  }
  PX.rect(ctx, GX + 10, GY + 11, GW - 20, 1, PLT.ink);

  // 背板三角彩旗（庙会氛围，避免玻璃上半部太空）
  const buntY = GY + 24;
  PX.rect(ctx, GX + 10, buntY, GW - 20, 1, PLT.goldDark);
  for (let i = 0; i < 13; i++) {
    const fx = GX + 24 + i * 32;
    const col = i % 3 === 0 ? PLT.gold : i % 3 === 1 ? PLT.redLight : PLT.red;
    PX.rect(ctx, fx, buntY + 1, 7, 1, col);
    PX.rect(ctx, fx + 1, buntY + 2, 5, 1, col);
    PX.rect(ctx, fx + 2, buntY + 3, 3, 1, col);
    PX.rect(ctx, fx + 3, buntY + 4, 1, 1, col);
  }

  // 左侧中国结（与右侧福旗平衡）
  const knotX = GX + 24;
  const knotY2 = GY + 44;
  PX.rect(ctx, knotX, knotY2 - 10, 1, 10, PLT.ink);
  const knotRows = [3, 5, 7, 9, 9, 9, 7, 5, 3];
  for (let i = 0; i < knotRows.length; i++) {
    const kw = knotRows[i];
    const left = knotX - Math.floor(kw / 2);
    PX.rect(ctx, left, knotY2 + i, kw, 1, i === 0 || i === knotRows.length - 1 ? PLT.redDark : PLT.red);
    PX.rect(ctx, left, knotY2 + i, 1, 1, PLT.redLight);
    PX.rect(ctx, left + kw - 1, knotY2 + i, 1, 1, PLT.redDark);
    PX.dot(ctx, left + Math.floor(kw / 2), knotY2 + i, PLT.goldDark);
  }
  PX.rect(ctx, knotX - 1, knotY2 + 9, 3, 1, PLT.gold);
  PX.rect(ctx, knotX - 3, knotY2 + 10, 1, 4, PLT.goldDark);
  PX.rect(ctx, knotX, knotY2 + 10, 1, 5, PLT.gold);
  PX.rect(ctx, knotX + 3, knotY2 + 10, 1, 4, PLT.goldDark);

  // 右侧悬挂福旗
  const flagX = GX + GW - 54;
  const flagY = GY + 26;
  const sway = Math.round(Math.sin(t * 1.5) * 2);
  PX.rect(ctx, flagX, flagY - 8, 1, 10, PLT.ink);
  PX.rect(ctx, flagX - 12 + sway, flagY + 2, 25, 44, PLT.ink);
  PX.rect(ctx, flagX - 11 + sway, flagY + 3, 23, 42, PLT.redDeep);
  PX.rect(ctx, flagX - 11 + sway, flagY + 3, 23, 1, PLT.goldDark);
  PX.rect(ctx, flagX - 11 + sway, flagY + 44, 23, 1, PLT.goldDark);
  Txt.draw(ctx, '福', flagX + sway, flagY + 23, {
    size: 17,
    color: PLT.gold,
    align: 'center',
    valign: 'middle',
    outline: 1,
    outlineColor: PLT.redDeep,
  });

  // 内部地面
  PX.rect(ctx, GX, GY + GH - 12, GW, 12, mix(PLT.plum, PLT.ink, 0.35));
  PX.rect(ctx, GX, GY + GH - 12, GW, 1, mix(PLT.plum2, PLT.goldDark, 0.3));
  PX.dither(ctx, GX, GY + GH - 10, GW, 10, mix(PLT.plum, PLT.ink, 0.35), mix(PLT.plum2, PLT.ink, 0.3), 2);

  // 底部氛围光
  drawGlow(ctx, GX + 90, GY + GH - 4, 54, PLT.orange, 0.12);
  drawGlow(ctx, GX + GW - 110, GY + GH - 4, 54, PLT.red, 0.12);
  drawGlow(ctx, GX + GW / 2, GY + GH - 6, 70, PLT.gold, 0.08);

  // 地面灯带
  for (let i = 0; i < 22; i++) {
    const bx = GX + 14 + i * 20;
    const ph = Math.floor(t * 6 + i) % 4;
    const col = ph === 0 ? PLT.goldLight : ph === 1 ? PLT.gold : ph === 2 ? PLT.redLight : PLT.redDark;
    PX.rectA(ctx, bx, GY + GH - 4, 6, 2, col, ph < 2 ? 0.95 : 0.5);
  }
}

function drawSpotlight(ctx, k, cx) {
  const kk = frac(k, 0);
  if (kk <= 0.01) return;
  const x = clamp(num(cx, GLASS_CX), GX + 20, GX + GW - 20);
  const topY = GY + 2;
  const botY = FLOOR;
  for (let y = topY; y < botY; y += 2) {
    const p = (y - topY) / (botY - topY);
    const halfW = 10 + p * 116;
    const a = kk * 0.14 * (1 - p * 0.3);
    PX.rectA(ctx, x - halfW, y, halfW * 2, 2, PLT.goldLight, a);
  }
  drawGlow(ctx, x, GY + 34, 74, PLT.goldLight, 0.2 * kk);
}

function drawClaw(ctx, state, t) {
  const rawX = clamp(num(state.clawX, GLASS_CX), CLAW_RANGE.min, CLAW_RANGE.max);
  const cx = Math.round(clamp(rawX, GX + 16, GX + GW - 16));
  // 游戏侧 clawY 从 railY(110) 到 dropY(250)；爪体中心最低收在玻璃顶部下方，避免压到灯箱
  const cy = Math.round(clamp(num(state.clawY, 160), GY + 7, M.dropY + 4));
  const open = clamp(num(state.clawOpen, 0.5), 0, 1);
  const phase = typeof state.phase === 'string' ? state.phase : 'idle';

  // 导轨
  PX.rect(ctx, GX + 2, RAIL_Y, GW - 4, 3, PLT.greyDark);
  PX.rect(ctx, GX + 2, RAIL_Y, GW - 4, 1, PLT.greyLight);

  // 滑块
  PX.rect(ctx, cx - 11, RAIL_Y - 3, 22, 9, PLT.ink);
  PX.rect(ctx, cx - 10, RAIL_Y - 2, 20, 7, PLT.greyDark);
  PX.rect(ctx, cx - 10, RAIL_Y - 2, 20, 1, PLT.greyLight);
  PX.rect(ctx, cx - 3, RAIL_Y, 6, 4, PLT.gold);
  PX.rect(ctx, cx - 2, RAIL_Y + 1, 2, 2, PLT.goldLight);
  PX.rect(ctx, cx - 9, RAIL_Y + 4, 3, 2, PLT.ink);
  PX.rect(ctx, cx + 6, RAIL_Y + 4, 3, 2, PLT.ink);

  // 钢丝绳
  const wireTop = RAIL_Y + 6;
  const wireBot = Math.max(wireTop, cy - 10);
  if (wireBot > wireTop) {
    PX.rect(ctx, cx, wireTop, 1, wireBot - wireTop, PLT.greyLight);
    PX.rect(ctx, cx + 1, wireTop, 1, wireBot - wireTop, PLT.greyDark);
    for (let y = wireTop + 4; y < wireBot; y += 8) {
      PX.rect(ctx, cx - 1, y, 3, 1, PLT.greyDark);
    }
  }

  // 爪体
  const by = cy - 6;
  PX.rect(ctx, cx - 9, by, 18, 6, PLT.ink);
  PX.rect(ctx, cx - 8, by + 1, 16, 4, PLT.greyDark);
  PX.rect(ctx, cx - 7, by + 1, 14, 1, PLT.greyLight);
  PX.rect(ctx, cx - 2, by + 2, 4, 3, PLT.gold);
  PX.rect(ctx, cx - 1, by + 2, 1, 1, PLT.goldLight);

  // 三爪
  const spread = 2 + open * 9;
  const len = 8 + open * 4;
  PX.line(ctx, cx, by + 6, cx, by + 6 + len - 2, PLT.greyDark, 2);
  PX.line(ctx, cx - 6, by + 6, cx - 6 - spread, by + 6 + len, PLT.ink, 3);
  PX.line(ctx, cx + 6, by + 6, cx + 6 + spread, by + 6 + len, PLT.ink, 3);
  PX.line(ctx, cx - 6, by + 6, cx - 6 - spread, by + 6 + len, PLT.greyLight, 2);
  PX.line(ctx, cx + 6, by + 6, cx + 6 + spread, by + 6 + len, PLT.greyLight, 2);
  PX.line(ctx, cx - 6 - spread, by + 6 + len, cx - 3 - spread, by + 10 + len, PLT.greyLight, 2);
  PX.line(ctx, cx + 6 + spread, by + 6 + len, cx + 3 + spread, by + 10 + len, PLT.greyLight, 2);

  // 抓取中的福袋：若游戏把它留在 pouches 列表里（含 open 动画），由福袋层绘制；
  // 沙盒里故意从列表移除时才在这里补画。
  const grabId = state.grab && state.grab.id != null ? String(state.grab.id) : '';
  const inList =
    !!grabId &&
    Array.isArray(state.pouches) &&
    state.pouches.some((p) => p && p.id != null && String(p.id) === grabId);
  if (state.grab && !inList) {
    const gold = state.grab.kind === 'gold';
    drawPouch(
      ctx,
      {
        id: state.grab.id != null ? state.grab.id : 'grab',
        x: cx,
        y: cy + 26,
        gold,
        scale: gold ? 0.86 : 0.9,
        wobble: 0.8,
      },
      t
    );
  }

  // 瞄准辅助
  if (phase === 'aim') {
    for (let y = cy + 20; y < FLOOR - 6; y += 6) {
      PX.rectA(ctx, cx, y, 1, 3, PLT.gold, 0.18);
    }
    PX.circleOutline(ctx, cx, FLOOR - 3, 15, PLT.goldDark, 1);
    PX.circleOutline(ctx, cx, FLOOR - 3, 9, PLT.gold, 1);
    const bx = cx - 18;
    const byy = cy - 16;
    PX.rect(ctx, bx, byy, 6, 1, PLT.goldLight);
    PX.rect(ctx, bx, byy, 1, 6, PLT.goldLight);
    PX.rect(ctx, cx + 12, byy, 6, 1, PLT.goldLight);
    PX.rect(ctx, cx + 17, byy, 1, 6, PLT.goldLight);
    PX.rect(ctx, bx, cy + 8, 6, 1, PLT.goldLight);
    PX.rect(ctx, bx, cy + 3, 1, 6, PLT.goldLight);
    PX.rect(ctx, cx + 12, cy + 8, 6, 1, PLT.goldLight);
    PX.rect(ctx, cx + 17, cy + 3, 1, 6, PLT.goldLight);
  }

  // 抓取瞬间火花
  if (phase === 'grab' && state.grab) {
    const sp = 0.5 + 0.5 * Math.sin(t * 18);
    drawGlow(ctx, cx, cy + 8, 18, PLT.goldLight, 0.1 + sp * 0.12);
    drawSparkle(ctx, cx - 12, cy + 6, 1, PLT.goldLight);
    drawSparkle(ctx, cx + 13, cy + 10, 1, PLT.goldLight);
  }
}

function drawGlassFront(ctx) {
  // 斜面玻璃反光（横向小台阶，保持硬边）
  for (let i = 0; i < 120; i += 3) {
    PX.rectA(ctx, GX + 34 + i * 0.55, GY + 12 + i, 3, 8, PLT.white, 0.045);
  }
  for (let i = 0; i < 90; i += 3) {
    PX.rectA(ctx, GX + 250 + i * 0.5, GY + 18 + i, 2, 6, PLT.white, 0.035);
  }
  // 顶部/左侧玻璃高光
  PX.rectA(ctx, GX + 2, GY + 1, GW - 4, 2, PLT.white, 0.08);
  PX.rectA(ctx, GX + 1, GY + 2, 2, GH - 4, PLT.white, 0.05);
  PX.rectA(ctx, GX + 2, GY + GH - 3, GW - 4, 1, PLT.ink, 0.5);

  // 玻璃内描边
  PX.frame(ctx, GX, GY, GW, GH, PLT.ink, 1);
  PX.frame(ctx, GX + 1, GY + 1, GW - 2, GH - 2, mix(PLT.goldDark, PLT.ink, 0.5), 1);

  // 四角铆钉
  const rivets = [
    [GX + 4, GY + 4],
    [GX + GW - 6, GY + 4],
    [GX + 4, GY + GH - 6],
    [GX + GW - 6, GY + GH - 6],
  ];
  for (let i = 0; i < rivets.length; i++) {
    PX.rect(ctx, rivets[i][0], rivets[i][1], 2, 2, PLT.goldDark);
    PX.dot(ctx, rivets[i][0], rivets[i][1], PLT.goldLight);
  }

  // 玻璃上的金色贴纸
  drawStar(ctx, GX + 30, GY + 30, 1, PLT.goldDark);
  drawStar(ctx, GX + GW - 30, GY + GH - 34, 1, PLT.goldDark);
}

function drawReveal(ctx, state, t) {
  const rawNum = state.revealNumber;
  const label = rawNum == null ? '' : String(rawNum);
  if (!label) return;
  const cx = GLASS_CX;
  const cy = 190;
  const pulse = 0.5 + 0.5 * Math.sin(t * 3);

  drawGlow(ctx, cx, cy, 74, PLT.gold, 0.2 + pulse * 0.12);
  PX.circleOutline(ctx, cx, cy, 48 + Math.round(pulse * 2), PLT.goldDark, 2);
  PX.circleOutline(ctx, cx, cy, 54 + Math.round(pulse * 3), PLT.bronze, 1);

  const unit = label.length >= 5 ? 4 : label.length >= 3 ? 5 : 6;
  const mw = Txt.measureDigits(label, { unit });
  const pw = Math.min(GX + GW - 24, Math.max(96, mw.w + 34));
  const ph = 52;
  const px = cx - Math.round(pw / 2);
  const py = cy - Math.round(ph / 2);

  // 号码牌
  PX.rectA(ctx, px + 2, py + 3, pw, ph, PLT.void, 0.45);
  PX.rect(ctx, px, py, pw, ph, PLT.ink);
  PX.rect(ctx, px + 1, py + 1, pw - 2, ph - 2, PLT.gold);
  PX.rect(ctx, px + 3, py + 3, pw - 6, ph - 6, PLT.redDeep);
  PX.rect(ctx, px + 4, py + 5, pw - 8, 1, PLT.redLight);
  PX.rect(ctx, px + 4, py + ph - 6, pw - 8, 1, PLT.redDark);
  for (let i = 0; i < 4; i++) {
    const gx = i % 2 === 0 ? px + 4 : px + pw - 6;
    const gy = i < 2 ? py + 4 : py + ph - 6;
    PX.rect(ctx, gx, gy, 2, 2, PLT.goldLight);
  }
  Txt.draw(ctx, '中奖号码', cx, py - 12, {
    size: 12,
    color: PLT.cream,
    align: 'center',
    valign: 'middle',
    outline: 0,
  });
  Txt.digits(ctx, label, cx, cy, {
    unit,
    color: PLT.gold,
    align: 'center',
    valign: 'middle',
    outline: 1,
    outlineColor: PLT.redDeep,
  });
}

function drawSign(ctx, t) {
  const { x, y, w } = M;
  const sx = x + 74;
  const sw = w - 148;
  const sy = y + 2;
  const sh = 17;
  Txt.draw(ctx, '福袋抓抓乐', GLASS_CX, sy + Math.round(sh / 2) + 1, {
    size: 12,
    color: PLT.goldLight,
    align: 'center',
    valign: 'middle',
    outline: 0,
  });
  drawStar(ctx, sx + 24, sy + Math.round(sh / 2), 1, PLT.goldLight);
  drawStar(ctx, sx + sw - 24, sy + Math.round(sh / 2), 1, PLT.goldLight);
  drawStar(ctx, sx + 40, sy + Math.round(sh / 2), 1, PLT.goldDark);
  drawStar(ctx, sx + sw - 40, sy + Math.round(sh / 2), 1, PLT.goldDark);
  // 招牌跑马灯
  for (let i = 0; i < 14; i++) {
    const bx = sx + 40 + i * Math.floor((sw - 80) / 13);
    const on = Math.floor(t * 9 + i) % 3 !== 0;
    PX.rect(ctx, bx, sy + 2, 2, 2, on ? PLT.goldLight : PLT.bronze);
    if (on) drawGlow(ctx, bx + 1, sy + 3, 5, PLT.gold, 0.3);
  }
}

function drawBottomLights(ctx, t) {
  const { x, y, w, h } = M;
  const count = 20;
  const step = (w - 40) / count;
  for (let i = 0; i < count; i++) {
    const bx = x + 20 + Math.round(i * step);
    const seq = Math.floor(t * 8) - i;
    const on = ((seq % 3) + 3) % 3 === 0;
    const col = i % 2 === 0 ? PLT.goldLight : PLT.redLight;
    PX.rect(ctx, bx, y + h - 4, 3, 2, on ? col : PLT.bronze);
    if (on) drawGlow(ctx, bx + 1, y + h - 3, 6, col, 0.3);
  }
}

const CHASE_BULBS = (() => {
  const list = [];
  const { x, y, w, h } = M;
  for (let bx = x + 18; bx <= x + w - 18; bx += 24) {
    list.push([bx, y + 2]);
    list.push([bx, y + h - 3]);
  }
  for (let by = y + 20; by <= y + h - 22; by += 24) {
    list.push([x + 2, by]);
    list.push([x + w - 3, by]);
  }
  return list;
})();

function drawChaseLights(ctx, t) {
  for (let i = 0; i < CHASE_BULBS.length; i++) {
    const seq = Math.floor(t * 8) - i * 2;
    const on = ((seq % 5) + 5) % 5 < 2;
    const col = i % 2 === 0 ? PLT.goldLight : PLT.redLight;
    const bx = CHASE_BULBS[i][0];
    const by = CHASE_BULBS[i][1];
    PX.rect(ctx, bx, by, 2, 2, on ? col : PLT.bronze);
    if (on) drawGlow(ctx, bx + 1, by + 1, 5, col, 0.28);
  }
}

function drawAssist(ctx, state, t, pouches) {
  if (!state.assist) return;
  let target = null;
  if (state.goldId != null) {
    const gid = String(state.goldId);
    target = pouches.find((p) => p.id === gid && p.gold) || null;
  }
  if (!target) target = pouches.find((p) => p.gold) || null;
  if (!target) return;
  const x = Math.round(target.x);
  const baseH = target.gold ? M.goldBaseH : M.pouchBaseH;
  const top = Math.round(num(target.y, FLOOR) - baseH * target.scale);
  const pulse = 0.5 + 0.5 * Math.sin(t * 5);
  PX.circleOutline(ctx, x, top + 16, 24 + Math.round(pulse * 3), PLT.goldLight, 1);
  const ay = top - 18 - Math.round(pulse * 3);
  PX.line(ctx, x, ay, x, ay + 8, PLT.goldLight, 2);
  PX.line(ctx, x - 4, ay + 4, x, ay + 8, PLT.goldLight, 2);
  PX.line(ctx, x + 4, ay + 4, x, ay + 8, PLT.goldLight, 2);
  Txt.draw(ctx, '保底提示', x, ay - 8, {
    size: 11,
    color: PLT.goldLight,
    align: 'center',
    valign: 'middle',
    outline: 0,
  });
}

function drawPhaseHint(ctx, state) {
  // miss/retry 的文字提示由 play.js 统一绘制，这里只画未中次数红点，避免重复。
  const misses = Math.round(clamp(num(state.misses, 0), 0, 8));
  for (let i = 0; i < misses; i++) {
    PX.rect(ctx, GX + 14 + i * 8, GY + GH - 8, 3, 3, PLT.redLight);
    PX.dot(ctx, GX + 14 + i * 8, GY + GH - 8, PLT.redDark);
  }
}

/* ------------------------------------------------------------------ */
/* 面板                                                                */
/* ------------------------------------------------------------------ */

const PANEL_STYLES = {
  dark: { bg: PLT.ink2, bg2: PLT.night, border: PLT.goldDark, rivet: PLT.goldDark },
  red: { bg: PLT.redDark, bg2: PLT.redDeep, border: PLT.gold, rivet: PLT.goldLight },
  gold: { bg: PLT.goldDark, bg2: PLT.bronze, border: PLT.goldLight, rivet: PLT.cream },
  plain: { bg: PLT.night, bg2: PLT.ink2, border: PLT.plum2, rivet: null },
};

function drawPanelInto(ctx, x, y, w, h, variant) {
  const st = PANEL_STYLES[variant] || PANEL_STYLES.dark;
  if (w < 8 || h < 8) {
    PX.rect(ctx, x, y, w, h, st.bg);
    return;
  }
  PX.rectA(ctx, x + 2, y + 3, w, h, PLT.void, 0.35);
  PX.rect(ctx, x, y, w, h, PLT.ink);
  PX.rect(ctx, x + 1, y + 1, w - 2, h - 2, st.border);
  PX.rect(ctx, x + 3, y + 3, w - 6, h - 6, PLT.ink);
  PX.rect(ctx, x + 4, y + 4, w - 8, h - 8, st.bg);
  PX.rect(ctx, x + 4, y + 4, w - 8, 1, mix(st.bg, PLT.white, 0.12));
  PX.rect(ctx, x + 4, y + h - 5, w - 8, 1, shade(st.bg2, -0.25));
  PX.rectA(ctx, x + 4, y + 5, w - 8, 2, st.bg2, 0.4);
  if (st.rivet && w > 16 && h > 16) {
    const pts = [
      [x + 5, y + 5],
      [x + w - 7, y + 5],
      [x + 5, y + h - 7],
      [x + w - 7, y + h - 7],
    ];
    for (let i = 0; i < pts.length; i++) {
      PX.rect(ctx, pts[i][0], pts[i][1], 2, 2, PLT.ink);
      PX.rect(ctx, pts[i][0], pts[i][1], 1, 1, st.rivet);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Art 主体                                                            */
/* ------------------------------------------------------------------ */

export const Art = {
  /** 背景（委托 scene.js：静态层缓存 + 动态灯笼/雪/观众） */
  background(ctx, scene = 'home', t = 0, opts = {}) {
    drawBackground(ctx, scene, t, opts);
  },

  /** 主标题：金色牌匾 + 像素中文 + 高光 + 飘带 */
  title(ctx, t = 0) {
    const tt = num(t, 0);
    const bob = Math.round(Math.sin(tt * 1.7) * 2);
    const bw = 316;
    const bh = 46;
    const bx = Math.round((W - bw) / 2);
    const by = 14 + bob;

    // 飘带：两端尖角（逐行宽度变化）
    const notch = 11;
    for (let row = 0; row < bh; row++) {
      const edge = Math.min(row, bh - 1 - row);
      const inset = edge < notch ? notch - edge : 0;
      const left = bx + inset;
      const right = bx + bw - inset;
      const p = row / (bh - 1);
      PX.rect(ctx, left, by + row, right - left, 1, mix(PLT.redDeep, PLT.redDark, p * 0.5));
      // 两端斜切边描金，避免燕尾缺口没有轮廓
      if (inset > 0) {
        PX.rect(ctx, left, by + row, 1, 1, PLT.goldDark);
        PX.rect(ctx, right - 1, by + row, 1, 1, PLT.goldDark);
      }
    }
    // 金色上下边
    PX.rect(ctx, bx + notch, by, bw - notch * 2, 2, PLT.gold);
    PX.rect(ctx, bx + notch, by + bh - 2, bw - notch * 2, 2, PLT.goldDark);
    PX.rect(ctx, bx + notch - 2, by + 3, 2, bh - 6, PLT.goldDark);
    PX.rect(ctx, bx + bw - notch, by + 3, 2, bh - 6, PLT.goldDark);
    PX.rectA(ctx, bx + notch, by + 3, bw - notch * 2, 1, PLT.cream, 0.35);

    const ty = by + Math.round(bh / 2) + 1;
    // 深色描边层 + 金色主体
    Txt.draw(ctx, '新春福袋抓抓乐', GLASS_CX, ty + 1, {
      size: 27,
      color: PLT.goldDark,
      align: 'center',
      valign: 'middle',
      outline: 2,
      outlineColor: PLT.redDeep,
    });
    Txt.draw(ctx, '新春福袋抓抓乐', GLASS_CX, ty, {
      size: 27,
      color: PLT.gold,
      align: 'center',
      valign: 'middle',
      outline: 2,
      outlineColor: PLT.redDeep,
    });
    // 上半金色高光（矩形裁剪，无抗锯齿）
    ctx.save();
    ctx.beginPath();
    ctx.rect(bx, by + 2, bw, Math.round(bh * 0.42));
    ctx.clip();
    Txt.draw(ctx, '新春福袋抓抓乐', GLASS_CX, ty + 1, {
      size: 27,
      color: PLT.goldLight,
      align: 'center',
      valign: 'middle',
      alpha: 0.55,
    });
    ctx.restore();

    // 左右小福袋
    drawIcon(ctx, 'gift', bx + 22, ty, 1);
    drawIcon(ctx, 'gift', bx + bw - 22, ty, 1);

    // 副标题
    Txt.draw(ctx, '新春之夜 · 抓福袋 · 赢大奖', GLASS_CX, by + bh + 10, {
      size: 12,
      color: PLT.cream,
      align: 'center',
      valign: 'middle',
      outline: 0,
    });

    // 闪烁星
    for (let i = 0; i < 5; i++) {
      const k = 0.5 + 0.5 * Math.sin(tt * 2.2 + i * 1.7);
      if (k < 0.45) continue;
      const sx = bx + 20 + ((i * 71) % (bw - 40));
      const sy = by - 3 + (i % 2) * 6;
      drawSparkle(ctx, sx, sy, k > 0.85 ? 2 : 1, PLT.goldLight);
    }
  },

  /** 娃娃机：机身 + 玻璃 + 福袋 + 爪子 + 跑马灯 + 揭晓 */
  machine(ctx, state = {}, t = 0) {
    const s = state && typeof state === 'object' ? state : {};
    const tt = num(t, 0);
    const pouches = resolvePouches(s);
    const shake = clamp(num(s.shake, 0), 0, 14);

    ctx.save();
    if (shake > 0.4) {
      const dx = Math.round(Math.sin(tt * 71) * shake);
      const dy = Math.round(Math.cos(tt * 53) * shake * 0.7);
      ctx.translate(dx, dy);
    }

    drawCabinetBase(ctx, tt);

    // 玻璃内部整体裁剪，避免福袋/光柱在爪子上提时溢出到机身边框
    ctx.save();
    ctx.beginPath();
    ctx.rect(GX, GY, GW, GH);
    ctx.clip();
    drawGlassBack(ctx, s, tt);
    drawSpotlight(ctx, s.spotlight, GLASS_CX);
    for (let i = 0; i < pouches.length; i++) {
      drawPouch(ctx, pouches[i], tt);
    }
    drawClaw(ctx, s, tt);
    drawAssist(ctx, s, tt, pouches);
    drawPhaseHint(ctx, s);
    ctx.restore();

    drawGlassFront(ctx);
    drawReveal(ctx, s, tt);
    drawSign(ctx, tt);
    drawBottomLights(ctx, tt);
    drawChaseLights(ctx, tt);

    ctx.restore();
  },

  /** 终场：战报面板 + 统计 + 关卡中奖名单 */
  finale(ctx, t = 0, summary = {}) {
    const tt = num(t, 0);
    const s = summary && typeof summary === 'object' ? summary : {};
    const total = Math.round(num(s.totalWinners, 0));
    const players = Math.round(num(s.players, 0));

    PX.rectA(ctx, 0, 0, W, H, PLT.void, 0.26);
    drawGlow(ctx, GLASS_CX, 130, 250, PLT.gold, 0.13);
    drawGlow(ctx, 80, 60, 130, PLT.red, 0.12);
    drawGlow(ctx, W - 80, 60, 130, PLT.red, 0.12);

    // 标题牌（中央名单面板由 FinaleScreen 自己绘制，这里只做标题与两侧装饰）
    PX.rectA(ctx, 222, 6, 196, 36, PLT.redDeep, 0.55);
    PX.rectA(ctx, 222, 6, 196, 1, PLT.gold, 0.8);
    PX.rectA(ctx, 222, 41, 196, 1, PLT.goldDark, 0.8);

    // 标题
    Txt.draw(ctx, '好运连连', GLASS_CX, 22, {
      size: 25,
      color: PLT.gold,
      align: 'center',
      valign: 'middle',
      outline: 2,
      outlineColor: PLT.redDeep,
    });
    Txt.draw(ctx, '新春福袋抓抓乐 · 圆满收官', GLASS_CX, 48, {
      size: 12,
      color: PLT.cream,
      align: 'center',
      valign: 'middle',
      outline: 0,
    });

    // 统计
    const boxes = [
      { x: 166, label: '中奖人数', value: total, variant: 'red' },
      { x: 330, label: '参与人数', value: players, variant: 'dark' },
    ];
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      drawPanelInto(ctx, b.x, 64, 144, 42, b.variant);
      Txt.draw(ctx, b.label, b.x + 72, 73, {
        size: 11,
        color: i === 0 ? PLT.goldLight : PLT.greyLight,
        align: 'center',
        valign: 'middle',
      });
      Txt.digits(ctx, String(b.value), b.x + 72, 95, {
        unit: 3,
        color: i === 0 ? PLT.gold : PLT.cream,
        align: 'center',
        valign: 'middle',
        outline: 1,
        outlineColor: PLT.ink,
      });
    }

    // 两侧庙会装饰：灯笼 / 奖杯 / 金币 / 福袋，避开中央名单面板
    const sides = [
      { icon: 'lantern', x: 50, y: 152, scale: 2, glow: PLT.red },
      { icon: 'trophy', x: W - 50, y: 140, scale: 2, glow: PLT.gold },
      { icon: 'gift', x: 50, y: 252, scale: 2, glow: PLT.gold },
      { icon: 'coin', x: W - 50, y: 248, scale: 2, glow: PLT.goldLight },
    ];
    for (let i = 0; i < sides.length; i++) {
      const it = sides[i];
      const bob = Math.round(Math.sin(tt * 1.5 + i * 1.7) * 2);
      drawGlow(ctx, it.x, it.y + bob, 34, it.glow, 0.14);
      drawIcon(ctx, it.icon, it.x, it.y + bob, it.scale);
    }
    // 侧边星火
    for (let i = 0; i < 12; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const k = 0.5 + 0.5 * Math.sin(tt * 2 + i * 1.9);
      if (k < 0.5) continue;
      const x = side > 0 ? 20 + (i % 3) * 18 : W - 20 - (i % 3) * 18;
      const y = 118 + ((i * 29) % 168);
      drawSparkle(ctx, x, y, k > 0.85 ? 2 : 1, PLT.goldLight);
    }
  },

  /** 揭晓卡片：金色号码牌 */
  winnerCard(ctx, opts = {}) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const tt = num(o.t, 0);
    const label = o.number == null ? '' : String(o.number);
    const prize = o.prize == null ? '' : String(o.prize);
    const levelName = o.levelName == null ? '' : String(o.levelName);
    const accuracy = Number(o.accuracy);

    // 入场：0.3s 内从下方滑入（整数位移）
    const entry = clamp(tt / 0.3, 0, 1);
    const dy = Math.round((1 - entry) * 28);
    const cw = Math.min(302, W - 80);
    const ch = 182;
    const cx = Math.round((W - cw) / 2);
    const cy = 92 + dy;

    drawGlow(ctx, GLASS_CX, cy + ch / 2, 160, PLT.gold, 0.13);
    drawPanelInto(ctx, cx, cy, cw, ch, 'red');

    // 顶部金带
    PX.rect(ctx, cx + 4, cy + 4, cw - 8, 20, PLT.gold);
    PX.rect(ctx, cx + 4, cy + 4, cw - 8, 1, PLT.goldLight);
    PX.rect(ctx, cx + 4, cy + 23, cw - 8, 1, PLT.goldDark);
    Txt.draw(ctx, levelName || '荣耀揭晓', GLASS_CX, cy + 15, {
      size: 12,
      color: PLT.redDeep,
      align: 'center',
      valign: 'middle',
    });

    Txt.draw(ctx, '中奖号码', GLASS_CX, cy + 36, {
      size: 12,
      color: PLT.goldLight,
      align: 'center',
      valign: 'middle',
      outline: 0,
    });

    // 号码牌
    const unit = label.length >= 5 ? 4 : label.length >= 3 ? 5 : 7;
    const mw = Txt.measureDigits(label, { unit });
    const pw = Math.min(cw - 24, Math.max(96, mw.w + 30));
    const ph = 58;
    const px = GLASS_CX - Math.round(pw / 2);
    const py = cy + 46;
    PX.rect(ctx, px, py, pw, ph, PLT.ink);
    PX.rect(ctx, px + 1, py + 1, pw - 2, ph - 2, PLT.gold);
    PX.rect(ctx, px + 3, py + 3, pw - 6, ph - 6, PLT.redDeep);
    PX.rect(ctx, px + 4, py + 4, pw - 8, 1, PLT.redLight);
    for (let i = 0; i < 4; i++) {
      const gx = i % 2 === 0 ? px + 5 : px + pw - 7;
      const gy = i < 2 ? py + 5 : py + ph - 7;
      PX.rect(ctx, gx, gy, 2, 2, PLT.goldLight);
    }
    Txt.digits(ctx, label || '—', GLASS_CX, py + Math.round(ph / 2), {
      unit,
      color: PLT.gold,
      align: 'center',
      valign: 'middle',
      outline: 1,
      outlineColor: PLT.redDeep,
    });

    // 奖品
    Txt.draw(ctx, '奖品', cx + 18, cy + 128, {
      size: 11,
      color: PLT.goldDark,
      valign: 'middle',
    });
    Txt.draw(ctx, Txt.fit(prize || '—', cw - 78, { size: 13 }), cx + 48, cy + 128, {
      size: 13,
      color: PLT.cream,
      valign: 'middle',
      outline: 0,
    });

    // 命中率（accuracy 支持 0..1 或 0..100）
    if (Number.isFinite(accuracy)) {
      const pctv = accuracy <= 1 ? Math.round(accuracy * 100) : Math.round(accuracy);
      Txt.draw(ctx, '命中 ' + pctv + '%', GLASS_CX, cy + 150, {
        size: 11,
        color: PLT.goldLight,
        align: 'center',
        valign: 'middle',
        outline: 0,
      });
    } else {
      Txt.draw(ctx, '恭喜发财 · 好运连连', GLASS_CX, cy + 150, {
        size: 11,
        color: PLT.goldLight,
        align: 'center',
        valign: 'middle',
        outline: 0,
      });
    }

    // 角饰星
    const pulse = 0.5 + 0.5 * Math.sin(tt * 3);
    drawStar(ctx, cx + 10, cy + 10, 1, PLT.goldLight);
    drawStar(ctx, cx + cw - 10, cy + 10, 1, PLT.goldLight);
    if (pulse > 0.55) {
      drawSparkle(ctx, cx + 16, cy + ch - 16, 2, PLT.goldLight);
      drawSparkle(ctx, cx + cw - 18, cy + 34, 1, PLT.goldLight);
    }
  },

  /** 玩家令牌（名单/剩余玩家）。(x,y) 为令牌中心 */
  playerToken(ctx, opts = {}) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const tt = num(o.t, 0);
    const scale = clamp(num(o.scale, 1), 0.6, 2);
    const number = o.number == null ? '' : String(o.number);
    const won = !!o.won;
    const dim = !!o.dim;
    const bw = Math.round(40 * scale);
    const bh = Math.round(24 * scale);
    const x = Math.round(num(o.x, 0)) - Math.round(bw / 2);
    const y = Math.round(num(o.y, 0)) - Math.round(bh / 2) + (won ? Math.round(Math.sin(tt * 3)) : 0);
    const a = dim ? 0.35 : 1;
    const bodyCol = won ? PLT.goldDark : PLT.redDeep;
    const borderCol = won ? PLT.goldLight : PLT.goldDark;

    if (a < 1) {
      ctx.save();
      ctx.globalAlpha = a;
    }
    PX.rectA(ctx, x + 1, y + 2, bw, bh, PLT.void, 0.35);
    PX.rect(ctx, x, y, bw, bh, PLT.ink);
    PX.rect(ctx, x + 1, y + 1, bw - 2, bh - 2, borderCol);
    PX.rect(ctx, x + 2, y + 2, bw - 4, bh - 4, bodyCol);
    PX.rectA(ctx, x + 2, y + 2, bw - 4, 1, PLT.goldLight, won ? 0.55 : 0.25);
    if (won) {
      drawGlow(ctx, x + bw / 2, y + bh / 2, Math.round(bw * 0.7), PLT.gold, 0.18);
      drawStar(ctx, x + 7, y + 7, 1, PLT.goldLight);
    }
    const unit = number.length > 4 ? 1 : number.length > 2 ? 2 : 3;
    Txt.digits(ctx, number || '—', x + bw / 2, y + bh / 2, {
      unit,
      color: won ? PLT.redDeep : PLT.cream,
      align: 'center',
      valign: 'middle',
      outline: 1,
      outlineColor: won ? PLT.goldLight : PLT.ink,
      alpha: a,
    });
    if (a < 1) ctx.restore();
  },

  /** 像素面板 */
  panel(ctx, opts = {}) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const x = Math.round(num(o.x, 0));
    const y = Math.round(num(o.y, 0));
    const w = Math.round(num(o.w, 0));
    const h = Math.round(num(o.h, 0));
    if (w < 4 || h < 4) return;
    drawPanelInto(ctx, x, y, w, h, o.variant || 'dark');
  },

  /** 像素按钮；支持 opts.pressed 表示按下 */
  button(ctx, opts = {}) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const w = Math.round(num(o.w, 0));
    const h = Math.round(num(o.h, 0));
    if (w < 12 || h < 10) return;
    const hover = !!o.hover;
    const disabled = !!o.disabled;
    const primary = !!o.primary;
    const pressed = !!o.pressed;
    const off = pressed ? Math.min(2, Math.round(h * 0.1)) : 0;
    const x = Math.round(num(o.x, 0));
    const y = Math.round(num(o.y, 0)) + off;
    const tt = num(o.t, 0);

    PX.rectA(ctx, x + 2, y + 3, w, h, PLT.void, 0.45);
    PX.rect(ctx, x, y, w, h, PLT.ink);
    PX.rect(
      ctx,
      x + 1,
      y + 1,
      w - 2,
      h - 2,
      disabled ? PLT.greyDark : primary || hover ? PLT.goldLight : PLT.gold
    );
    PX.rect(ctx, x + 3, y + 3, w - 6, h - 6, PLT.ink);
    const base = disabled ? PLT.greyDark : primary ? mix(PLT.red, PLT.redDark, 0.28) : PLT.redDeep;
    const body = disabled ? PLT.grey : hover ? mix(base, PLT.redLight, 0.35) : base;
    PX.rect(ctx, x + 4, y + 4, w - 8, h - 8, body);
    PX.rect(ctx, x + 4, y + 4, w - 8, 1, disabled ? PLT.greyLight : mix(body, PLT.white, 0.25));
    PX.rect(ctx, x + 4, y + h - 5, w - 8, 1, shade(body, -0.25));

    if (w > 40 && h > 20) {
      const rivets = [
        [x + 6, y + 6],
        [x + w - 8, y + 6],
        [x + 6, y + h - 8],
        [x + w - 8, y + h - 8],
      ];
      for (let i = 0; i < rivets.length; i++) {
        PX.rect(ctx, rivets[i][0], rivets[i][1], 2, 2, PLT.ink);
        PX.dot(ctx, rivets[i][0], rivets[i][1], disabled ? PLT.grey : PLT.goldDark);
      }
    }

    if (primary && !disabled) {
      const glowA = 0.16 + 0.08 * (0.5 + 0.5 * Math.sin(tt * 4)) + (hover ? 0.1 : 0);
      drawGlow(ctx, x + w / 2, y + h / 2, Math.round(w * 0.55), PLT.gold, glowA);
    }

    const size = clamp(Math.round(h * 0.46), 9, 18);
    const label = Txt.fit(String(o.label == null ? '' : o.label), w - 18, { size });
    Txt.draw(ctx, label, x + w / 2, y + h / 2 + (pressed ? 1 : 0), {
      size,
      color: disabled ? PLT.greyLight : primary ? PLT.goldLight : PLT.cream,
      align: 'center',
      valign: 'middle',
      outline: 1,
      outlineColor: PLT.ink,
      alpha: disabled ? 0.7 : 1,
    });
  },

  /** 16×16 图标；默认 (x,y) 为图标中心，opts.anchor='topleft' 改为左上角 */
  icon(ctx, name, x, y, scale = 1, opts = {}) {
    drawIcon(ctx, name, x, y, scale, opts || {});
  },

  /** 难度星标（4 颗星；支持 1-4 数字或 easy/normal/hard/extreme）。
   *  默认 (x,y) 为左上角，opts.anchor='center' 时居中。 */
  levelBadge(ctx, opts = {}) {
    const o = opts && typeof opts === 'object' ? opts : {};
    const diff = diffValue(o.difficulty);
    const scale = clamp(num(o.scale, 1), 0.6, 2);
    const step = 9 * scale;
    const total = step * 4 - 2 * scale;
    let x = num(o.x, 0);
    if (o.anchor === 'center') x -= total / 2;
    const cy = num(o.y, 0) + 3.5 * scale;
    for (let i = 0; i < 4; i++) {
      const cx = x + i * step + 3.5 * scale;
      if (i < diff) {
        drawStar(ctx, cx, cy, scale, i === 3 ? PLT.goldLight : PLT.gold);
        if (i === 0) drawGlow(ctx, cx, cy, 10 * scale, PLT.gold, 0.12);
      } else {
        drawStar(ctx, cx, cy, scale, PLT.plum2);
      }
    }
  },

  /* ------------------------- 沙盒辅助 API ------------------------- */

  /** 单独绘制福袋（沙盒/调试用）。opts: {x,y,gold,open,lift,scale,wobble,id,t} */
  pouch(ctx, opts = {}) {
    const o = opts || {};
    return drawPouch(ctx, o, num(o.t, 0));
  },

  /** 单独绘制爪子（沙盒/调试用）。opts: {x,y,open,grab,t,phase} */
  claw(ctx, opts = {}) {
    const o = opts || {};
    drawClaw(
      ctx,
      {
        clawX: num(o.x, GLASS_CX),
        clawY: num(o.y, 170),
        clawOpen: num(o.open, 0.5),
        phase: o.phase || 'idle',
        grab: o.grab || null,
      },
      num(o.t, 0)
    );
  },
};
