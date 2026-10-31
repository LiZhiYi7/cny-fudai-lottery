// 粒子与屏幕效果：彩纸 / 烟花 / 金币雨 / 火花 / 震屏 / 闪白 / 开奖光环。
// 全部 2D 矩形 + 像素圆绘制（无抗锯齿），粒子总数硬上限 400。
// 用法：主循环里 FX.update(dt) → FX.drawBack(ctx)（场景之后、主体之前）
//      → FX.drawFront(ctx)（最上层）。震屏用 FX.getShake() 自行偏移。

import { VIEW } from './geometry.js';
import { PLT, mix } from './palette.js';
import { PX, num, clamp, drawGlow, drawCoin, drawSparkle } from './sprites.js';

const W = VIEW.W;
const H = VIEW.H;
const MAX_PARTICLES = 400;
const MAX_RINGS = 24;
const MAX_EMITTERS = 8;

const parts = [];
const rings = [];
const emitters = [];

let time = 0;
let shakeAmp = 0;
let shakeLeft = 0;
let shakeDur = 0.001;
let shakeSeed = 0;
let flashColor = PLT.white;
let flashLeft = 0;
let flashDur = 0.001;

const CONFETTI_COLORS = [PLT.gold, PLT.red, PLT.redLight, PLT.cream, PLT.jade, PLT.pink, PLT.goldLight, PLT.cyan];
const FIREWORK_COLORS = [PLT.gold, PLT.redLight, PLT.pink, PLT.jade, PLT.cyan, PLT.cream, PLT.orange];

function rand() {
  return Math.random();
}

function push(p) {
  if (parts.length >= MAX_PARTICLES) parts.splice(0, parts.length - MAX_PARTICLES + 1);
  parts.push(p);
}

function pushRing(r) {
  if (rings.length >= MAX_RINGS) rings.shift();
  rings.push(r);
}

function spawnConfetti(x, y, count, opts) {
  const o = opts || {};
  const colors = Array.isArray(o.colors) && o.colors.length ? o.colors : CONFETTI_COLORS;
  const speed = num(o.speed, 110);
  const gravity = num(o.gravity, 250);
  const life = num(o.life, 1.5);
  const up = o.up !== false; // 默认向上喷
  const spread = num(o.spread, 1.4);
  for (let i = 0; i < count; i++) {
    const ang = up ? -Math.PI / 2 + (rand() - 0.5) * spread : rand() * Math.PI * 2;
    const spd = speed * (0.35 + rand() * 0.9);
    const lf = life * (0.7 + rand() * 0.7);
    push({
      kind: 'confetti',
      layer: 'front',
      x: x + (rand() - 0.5) * 24,
      y: y + (rand() - 0.5) * 12,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 20,
      gravity,
      drag: 0.5,
      life: lf,
      maxLife: lf,
      color: colors[Math.floor(rand() * colors.length)],
      seed: rand() * 6.28,
    });
  }
}

/* ------------------------------------------------------------------ */
/* 对外 API                                                            */
/* ------------------------------------------------------------------ */

export const FX = {
  /** 清空所有粒子 / 震屏 / 闪白 / 光环 */
  clear() {
    parts.length = 0;
    rings.length = 0;
    emitters.length = 0;
    shakeAmp = 0;
    shakeLeft = 0;
    flashLeft = 0;
    flashDur = 0.001;
    time = 0;
  },

  /** 主循环每帧调用，dt 为秒 */
  update(dt) {
    const d = clamp(num(dt, 0), 0, 0.06);
    time += d;

    // 发射器（金币雨等）
    for (let i = emitters.length - 1; i >= 0; i--) {
      const e = emitters[i];
      e.left -= d;
      e.acc += d * e.rate;
      let guard = 0;
      while (e.acc >= 1 && guard++ < 40) {
        e.acc -= 1;
        e.spawn();
      }
      if (e.left <= 0) emitters.splice(i, 1);
    }

    // 粒子
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= d;
      if (p.life <= 0) {
        parts.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * d;
      const drag = Math.max(0, 1 - p.drag * d);
      p.vx *= drag;
      p.vy *= drag;
      p.x += p.vx * d;
      p.y += p.vy * d;
      if (p.y > H + 30 || p.x < -40 || p.x > W + 40) {
        p.life = 0;
      }
    }

    // 光环
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= d;
      if (r.life <= 0) {
        rings.splice(i, 1);
        continue;
      }
      const k = 1 - r.life / r.maxLife;
      r.radius = r.r0 + (r.r1 - r.r0) * (1 - Math.pow(1 - k, 2));
    }

    if (shakeLeft > 0) shakeLeft = Math.max(0, shakeLeft - d);
    if (flashLeft > 0) flashLeft = Math.max(0, flashLeft - d);
  },

  /** 场景之后、主体之前（烟花/光环） */
  drawBack(ctx) {
    // 光环
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      const a = clamp(r.life / r.maxLife, 0, 1);
      const rad = Math.round(r.radius);
      if (rad < 2) continue;
      ctx.save();
      ctx.globalAlpha = 0.2 + a * 0.8;
      PX.circleOutline(ctx, r.x, r.y, rad, r.color, Math.max(1, Math.round(r.width)));
      ctx.restore();
      // 固定半径的中心光晕，避免随半径变化产生大量缓存条目
      if (r.glow) drawGlow(ctx, r.x, r.y, 28, r.color, 0.12 * a);
    }
    // 背景层粒子（烟花）
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.layer !== 'back') continue;
      const a = clamp(p.life / p.maxLife, 0, 1);
      if (p.kind === 'spark') {
        const px = Math.round(p.x);
        const py = Math.round(p.y);
        PX.rectA(ctx, px - p.vx * 0.022, py - p.vy * 0.022, 1, 1, p.color, a * 0.45);
        PX.rectA(ctx, px, py, p.size, p.size, mix(p.color, PLT.white, a * 0.35), a);
        if (a > 0.7) PX.dot(ctx, px, py, PLT.white);
      } else if (p.kind === 'glow') {
        drawGlow(ctx, p.x, p.y, 26, p.color, a * 0.45);
        drawGlow(ctx, p.x, p.y, 12, PLT.cream, a * 0.25);
      }
    }
  },

  /** 最上层（彩纸/金币雨/火花/闪白） */
  drawFront(ctx) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.layer !== 'front') continue;
      const a = clamp(p.life / p.maxLife, 0, 1);
      const px = Math.round(p.x);
      const py = Math.round(p.y);
      if (p.kind === 'confetti') {
        const fl = Math.sin(p.life * 9 + p.seed);
        const cw = 2 + Math.round(1.5 * (0.5 + 0.5 * Math.sin(p.life * 12 + p.seed * 1.7)));
        const ch = 2;
        PX.rectA(ctx, px + Math.round(fl * 2), py, cw, ch, p.color, a);
        PX.rectA(ctx, px + Math.round(fl * 2) - 1, py - 1, 1, 1, PLT.white, a * 0.35);
      } else if (p.kind === 'coin') {
        const spin = Math.abs(Math.sin(p.life * 8 + p.seed));
        drawCoin(ctx, px, py, p.size || 1, spin);
        if (a < 0.35) PX.rectA(ctx, px - 2, py - 2, 4, 4, PLT.gold, a * 0.6);
      } else if (p.kind === 'spark') {
        PX.rectA(ctx, px, py, p.size || 2, p.size || 2, mix(p.color, PLT.white, a * 0.5), a);
        if (a > 0.6) PX.dot(ctx, px, py, PLT.white);
        // 拖尾
        PX.rectA(ctx, px - p.vx * 0.03, py - p.vy * 0.03, 1, 1, p.color, a * 0.4);
      }
    }

    // 闪白
    if (flashLeft > 0.001) {
      const a = clamp(flashLeft / flashDur, 0, 1) * 0.82;
      PX.rectA(ctx, 0, 0, W, H, flashColor, a);
    }
  },

  /** 当前震屏偏移（整数像素） */
  getShake() {
    if (shakeLeft <= 0 || shakeAmp <= 0) return { x: 0, y: 0 };
    const k = clamp(shakeLeft / shakeDur, 0, 1);
    const amp = shakeAmp * k * k;
    const x = Math.sin(time * 63 + shakeSeed) * amp;
    const y = Math.cos(time * 47 + shakeSeed * 1.7) * amp * 0.8;
    return { x: Math.round(x), y: Math.round(y) };
  },

  /** 彩纸：默认从 (x,y) 向上喷射 */
  confetti(x, y, count = 40, opts = {}) {
    const n = Math.round(clamp(num(count, 40), 1, 120));
    spawnConfetti(num(x, W / 2), num(y, H / 2), n, opts || {});
  },

  /** 烟花：以 (x,y) 为中心的放射火花 + 一圈扩散光环 */
  firework(x, y, opts = {}) {
    const o = opts || {};
    const cx = num(x, W / 2);
    const cy = num(y, 120);
    const color = o.color || FIREWORK_COLORS[Math.floor(rand() * FIREWORK_COLORS.length)];
    const count = Math.round(clamp(num(o.count, 30), 8, 70));
    const scale = clamp(num(o.scale, 1), 0.4, 2);

    push({
      kind: 'glow',
      layer: 'back',
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      gravity: 0,
      drag: 0,
      life: 0.3,
      maxLife: 0.3,
      color,
    });

    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + rand() * 0.25;
      const spd = (50 + rand() * 100) * scale;
      const lf = (0.7 + rand() * 0.7) * scale;
      const col = rand() < 0.55 ? color : rand() < 0.6 ? PLT.cream : FIREWORK_COLORS[Math.floor(rand() * FIREWORK_COLORS.length)];
      push({
        kind: 'spark',
        layer: 'back',
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        gravity: 75 * scale,
        drag: 1.7,
        life: lf,
        maxLife: lf,
        size: rand() < 0.3 ? 2 : 1,
        color: col,
      });
    }
    pushRing({ x: cx, y: cy, color, r0: 6, r1: 58 * scale, life: 0.5, maxLife: 0.5, width: 2, glow: true });
  },

  /** 金币雨：持续 seconds 秒 */
  coinRain(seconds = 2.2) {
    const dur = clamp(num(seconds, 2.2), 0.2, 12);
    if (emitters.length >= MAX_EMITTERS) emitters.shift();
    emitters.push({
      left: dur,
      rate: 20,
      acc: 0,
      spawn() {
        const lf = 2.4 + rand() * 1.2;
        push({
          kind: 'coin',
          layer: 'front',
          x: 14 + rand() * (W - 28),
          y: -10,
          vx: (rand() - 0.5) * 26,
          vy: 70 + rand() * 90,
          gravity: 150,
          drag: 0.08,
          life: lf,
          maxLife: lf,
          size: rand() < 0.25 ? 2 : 1,
          seed: rand() * 6.28,
        });
      },
    });
  },

  /** 小火花（抓取/按钮反馈） */
  sparks(x, y, count = 10, color = PLT.gold) {
    const n = Math.round(clamp(num(count, 10), 1, 60));
    const cx = num(x, W / 2);
    const cy = num(y, H / 2);
    for (let i = 0; i < n; i++) {
      const ang = rand() * Math.PI * 2;
      const spd = 30 + rand() * 90;
      const lf = 0.25 + rand() * 0.35;
      push({
        kind: 'spark',
        layer: 'front',
        x: cx,
        y: cy,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        gravity: 130,
        drag: 1.1,
        life: lf,
        maxLife: lf,
        size: rand() < 0.3 ? 2 : 1,
        color,
      });
    }
  },

  /** 震屏：amount 像素，seconds 秒 */
  shake(amount = 4, seconds = 0.25) {
    shakeAmp = Math.max(shakeAmp, clamp(num(amount, 4), 0, 20));
    shakeDur = Math.max(0.01, clamp(num(seconds, 0.25), 0.02, 3));
    shakeLeft = Math.max(shakeLeft, shakeDur);
    shakeSeed = rand() * 6.28;
  },

  /** 闪白/闪光 */
  flash(color = PLT.white, seconds = 0.25) {
    flashColor = color || PLT.white;
    flashDur = Math.max(0.02, clamp(num(seconds, 0.25), 0.02, 3));
    flashLeft = flashDur;
  },

  /** 开奖光环：从 radius 半径扩散 */
  ring(x, y, color = PLT.gold, radius = 40, seconds = 0.6) {
    const dur = Math.max(0.08, clamp(num(seconds, 0.6), 0.08, 4));
    pushRing({
      x: num(x, W / 2),
      y: num(y, H / 2),
      color: color || PLT.gold,
      r0: 6,
      r1: clamp(num(radius, 40), 8, 400),
      life: dur,
      maxLife: dur,
      width: 2,
      glow: true,
    });
  },

  /** 调试/沙盒：当前粒子数 */
  count() {
    return parts.length;
  },
};
