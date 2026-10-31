// 抓金福袋小游戏：状态机 + 爪子移动 + 判定。美术交给 Art.machine。

import { MACHINE, CLAW_RANGE } from '../render/geometry.js';
import { PLT } from '../render/palette.js';
import { FX } from '../render/fx.js';
import { pickWinner } from '../core/state.js';
import { randomInt } from '../core/rng.js';
import { difficultyOf } from '../core/constants.js';
import { audio } from './audio.js';

const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeIn = (k) => k * k;
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const ROUND = {
  intro: 0.8,
  drop: 0.5,
  lift: 0.7,
  open: 0.55,
  missLift: 0.55,
  miss: 1.15,
};

export class ClawGame {
  constructor({ session, levelIndex, onWin }) {
    this.session = session;
    this.levelIndex = levelIndex;
    this.level = session.config.levels[levelIndex];
    this.diff = difficultyOf(this.level.difficulty);
    this.onWin = onWin;
    this.phase = 'intro';
    this.phaseT = 0;
    this.t = 0;
    this.clawBaseX = (CLAW_RANGE.min + CLAW_RANGE.max) / 2;
    this.clawX = this.clawBaseX;
    this.clawY = MACHINE.railY;
    this.clawOpen = 1;
    this.grab = null;
    this.pouches = [];
    this.goldId = null;
    this.winner = null;
    this.accuracy = 0;
    this.misses = 0;
    this.assist = false;
    this.spotlight = 0;
    this.revealNumber = null;
    this.done = false;
    this.keys = { left: false, right: false };
    this.pointerX = null;
    this.spawnPouches();
  }

  spawnPouches() {
    const d = this.diff;
    const n = d.pouchCount;
    const span = MACHINE.innerRight - MACHINE.innerLeft;
    const goldIndex = randomInt(n);
    this.pouches = [];
    for (let i = 0; i < n; i++) {
      const k = n === 1 ? 0.5 : i / (n - 1);
      const x = MACHINE.innerLeft + 28 + k * (span - 56) + (Math.random() - 0.5) * 8;
      const gold = i === goldIndex;
      this.pouches.push({
        id: 'p' + i,
        x,
        baseX: x,
        y: MACHINE.pouchY + (i % 2) * 2,
        gold,
        open: 0,
        lift: 0,
        scale: gold && this.assist ? 1.18 : 1,
        wobble: (Math.random() - 0.5) * 0.16,
        phase: Math.random() * Math.PI * 2,
      });
    }
    this.goldId = this.pouches[goldIndex].id;
  }

  goldPouch() {
    return this.pouches.find((p) => p.gold);
  }

  grabPouch() {
    return this.grab ? this.pouches.find((p) => p.id === this.grab.id) : null;
  }

  setPhase(phase) {
    this.phase = phase;
    this.phaseT = 0;
    if (phase === 'open') {
      const p = this.goldPouch();
      if (p) this.revealNumber = this.winner === null ? null : String(this.winner);
    }
  }

  resetRound() {
    this.grab = null;
    this.spotlight = 0;
    this.spawnPouches();
    this.clawBaseX = (CLAW_RANGE.min + CLAW_RANGE.max) / 2;
    this.clawX = this.clawBaseX;
    this.clawY = MACHINE.railY;
    this.clawOpen = 1;
    this.setPhase('aim');
  }

  setPointerX(x) {
    this.pointerX = x === null || x === undefined ? null : clamp(x, CLAW_RANGE.min, CLAW_RANGE.max);
  }

  handleKeyDown(e) {
    const code = e.code;
    if (code === 'ArrowLeft' || code === 'KeyA') {
      this.keys.left = true;
      this.pointerX = null;
      e.preventDefault();
    } else if (code === 'ArrowRight' || code === 'KeyD') {
      this.keys.right = true;
      this.pointerX = null;
      e.preventDefault();
    } else if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') {
      e.preventDefault();
      this.drop();
    }
  }

  handleKeyUp(e) {
    const code = e.code;
    if (code === 'ArrowLeft' || code === 'KeyA') this.keys.left = false;
    if (code === 'ArrowRight' || code === 'KeyD') this.keys.right = false;
  }

  drop() {
    if (this.phase !== 'aim' || this.done) return false;
    this.setPhase('drop');
    audio.drop();
    return true;
  }

  update(dt) {
    this.t += dt;
    this.phaseT += dt;
    const d = this.diff;

    switch (this.phase) {
      case 'intro': {
        this.clawY = MACHINE.railY + Math.sin(this.t * 3) * 1.5;
        this.clawX = this.clawBaseX;
        if (this.phaseT >= ROUND.intro) this.setPhase('aim');
        break;
      }
      case 'aim': {
        this.moveClaw(dt);
        this.clawY = MACHINE.railY;
        this.clawOpen = 1;
        const gold = this.goldPouch();
        if (gold) {
          gold.x = clamp(
            gold.baseX + Math.sin(this.t * 1.35 + gold.phase) * d.wander,
            MACHINE.innerLeft + 18,
            MACHINE.innerRight - 18
          );
        }
        break;
      }
      case 'drop': {
        const k = Math.min(1, this.phaseT / ROUND.drop);
        this.clawY = MACHINE.railY + (MACHINE.dropY - MACHINE.railY) * easeIn(k);
        this.clawOpen = 1 - 0.7 * k;
        if (k >= 1) this.judge();
        break;
      }
      case 'lift': {
        const k = Math.min(1, this.phaseT / ROUND.lift);
        this.clawY = MACHINE.dropY - (MACHINE.dropY - (MACHINE.railY + 12)) * easeOut(k);
        this.clawOpen = 0.25;
        const p = this.grabPouch();
        if (p) {
          p.x = this.clawX;
          p.y = this.clawY + 20;
          p.lift = 1;
          p.open = Math.min(1, this.phaseT / 0.5);
        }
        if (k >= 1) {
          this.setPhase('open');
          audio.open();
        }
        break;
      }
      case 'open': {
        const p = this.grabPouch();
        if (p) p.open = Math.min(1, 0.4 + this.phaseT / 0.35);
        this.spotlight = Math.min(1, this.phaseT / 0.4);
        if (this.phaseT >= ROUND.open && !this.done) {
          this.done = true;
          if (this.onWin) this.onWin(this.winner, this.accuracy);
        }
        break;
      }
      case 'missLift': {
        const k = Math.min(1, this.phaseT / ROUND.missLift);
        const p = this.grabPouch();
        this.clawY = MACHINE.dropY - 26 * easeOut(k);
        this.clawOpen = 0.5;
        if (p) {
          p.x = this.clawX;
          p.y = this.clawY + 18;
          p.lift = 0.5;
        }
        if (k >= 1) this.setPhase('miss');
        break;
      }
      case 'miss': {
        if (this.phaseT >= ROUND.miss) this.resetRound();
        break;
      }
      default:
        break;
    }
  }

  moveClaw(dt) {
    const d = this.diff;
    let dir = 0;
    if (this.keys.left) dir -= 1;
    if (this.keys.right) dir += 1;
    if (dir !== 0) {
      this.clawBaseX += dir * d.clawSpeed * dt;
    } else if (this.pointerX !== null) {
      const diff = this.pointerX - this.clawBaseX;
      const step = d.clawSpeed * dt;
      this.clawBaseX += clamp(diff, -step, step);
    }
    this.clawBaseX = clamp(this.clawBaseX, CLAW_RANGE.min, CLAW_RANGE.max);
    const sway = Math.sin(this.t * d.swayHz * Math.PI * 2) * d.swayAmp;
    this.clawX = clamp(this.clawBaseX + sway, CLAW_RANGE.min, CLAW_RANGE.max);
  }

  judge() {
    const gold = this.goldPouch();
    const width = this.diff.goldWidth * (this.assist ? 1.6 : 1);
    const tolerance = width / 2 + 4;
    const dx = Math.abs(this.clawX - gold.x);
    this.accuracy = Math.max(0, 1 - dx / tolerance);

    if (dx <= tolerance) {
      this.grab = { kind: 'gold', id: gold.id };
      this.winner = pickWinner(this.session);
      if (this.winner === undefined) {
        // 理论上不会发生：奖池为空
        this.winner = null;
      }
      this.setPhase('lift');
      audio.grab();
      FX.sparks(gold.x, MACHINE.dropY, 18, PLT.gold);
      FX.ring(gold.x, MACHINE.dropY, PLT.gold, 54, 0.55);
      FX.shake(2, 0.12);
    } else {
      let nearest = this.pouches[0];
      for (const p of this.pouches) {
        if (Math.abs(p.x - this.clawX) < Math.abs(nearest.x - this.clawX)) nearest = p;
      }
      this.grab = { kind: 'normal', id: nearest.id };
      this.misses += 1;
      if (this.misses >= 3) this.assist = true;
      this.setPhase('missLift');
      audio.miss();
      FX.sparks(nearest.x, MACHINE.dropY, 6, PLT.greyLight);
    }
  }

  getState() {
    return {
      phase: this.phase,
      t: this.t,
      clawX: this.clawX,
      clawY: this.clawY,
      clawOpen: this.clawOpen,
      grab: this.grab,
      pouches: this.pouches,
      goldId: this.goldId,
      misses: this.misses,
      assist: this.assist,
      spotlight: this.spotlight,
      revealNumber: this.revealNumber,
      shake: 0,
    };
  }
}
