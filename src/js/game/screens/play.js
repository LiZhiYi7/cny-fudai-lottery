// 抓取主界面：HUD + 娃娃机 + 中奖揭晓。

import { BaseScreen } from '../screen.js';
import { Art, Txt, PLT, MACHINE } from '../../render/index.js';
import { FX } from '../../render/index.js';
import { ClawGame } from '../claw.js';
import {
  recordDraw,
  drawsOfLevel,
  remainingPlayers,
  pickWinner,
} from '../../core/state.js';
import { difficultyOf } from '../../core/constants.js';
import { audio } from '../audio.js';
import { toast } from '../ui.js';

export class PlayScreen extends BaseScreen {
  constructor(app, { levelIndex }) {
    super(app);
    this.name = 'play';
    this.levelIndex = levelIndex;
    this.level = app.session.config.levels[levelIndex];
    this.diff = difficultyOf(this.level.difficulty);
    this.revealed = null;
    this.lastPhase = '';
  }

  enter() {
    this.claw = new ClawGame({
      session: this.app.session,
      levelIndex: this.levelIndex,
      onWin: (player, accuracy) => this.handleWin(player, accuracy),
    });
    this.lastPhase = this.claw.phase;
    this.buildButtons();
    audio.startBgm();
  }

  slotNumber() {
    return drawsOfLevel(this.app.session, this.levelIndex).length + 1;
  }

  buildButtons() {
    this.clearButtons();
    const revealed = !!this.revealed;
    this.addButton({
      x: 24,
      y: 318,
      w: 64,
      h: 30,
      label: '退出',
      onClick: () => this.app.confirmAbandon(),
    });
    if (revealed) {
      this.addButton({
        x: 250,
        y: 318,
        w: 140,
        h: 32,
        label: '继 续',
        primary: true,
        onClick: () => this.app.continueAfterDraw(this.revealed),
      });
      this.addButton({
        x: 408,
        y: 318,
        w: 140,
        h: 30,
        label: '查看兑奖清单',
        onClick: () => this.app.openSheet(),
      });
    } else {
      this.addButton({
        x: 268,
        y: 318,
        w: 104,
        h: 32,
        label: '抓 取',
        primary: true,
        disabled: this.claw.phase !== 'aim',
        onClick: () => this.claw.drop(),
      });
      this.addButton({
        x: 400,
        y: 318,
        w: 118,
        h: 30,
        label: '放弃本局',
        onClick: () => this.app.confirmAbandon(),
      });
    }
  }

  handleWin(player, accuracy) {
    if (this.revealed) return;
    if (player === null || player === undefined) {
      toast('奖池为空，无法继续，请返回首页', 'error');
      return;
    }
    let draw;
    try {
      draw = recordDraw(this.app.session, {
        levelIndex: this.levelIndex,
        player,
        accuracy,
      });
    } catch (err) {
      toast(err.message || '记录中奖失败', 'error');
      return;
    }
    this.revealed = draw;
    this.claw.done = true;
    this.app.persistSession();

    audio.win();
    const diffScale = this.diff.fxScale || 1;
    FX.firework(220, 118, { color: PLT.gold, count: 42, scale: diffScale });
    FX.firework(430, 96, { color: PLT.red, count: 34, scale: diffScale });
    FX.confetti(320, 180, 70, { up: true, speed: 190, life: 2 });
    FX.shake(4.5, 0.4);
    FX.flash(PLT.gold, 0.16);
    FX.coinRain(1.1);
    this.buildButtons();
  }

  /** 测试/截图用：直接判定中奖 */
  forceWin(player) {
    if (this.revealed) return;
    const winner = player === undefined || player === null ? pickWinner(this.app.session) : player;
    this.claw.done = true;
    this.claw.spotlight = 1;
    this.claw.revealNumber = String(winner);
    this.claw.grab = { kind: 'gold', id: this.claw.goldId };
    const gold = this.claw.goldPouch();
    if (gold) gold.open = 1;
    this.handleWin(winner, 0.94);
  }

  update(dt) {
    if (!this.revealed) {
      this.claw.update(dt);
      if (this.claw.phase !== this.lastPhase) {
        this.lastPhase = this.claw.phase;
        this.buildButtons();
      }
    }
  }

  draw(ctx, t) {
    if (!this.app.session) return;
    const shake = FX.getShake();
    ctx.save();
    ctx.translate(shake.x, shake.y);
    Art.background(ctx, 'stage', t);
    Art.machine(ctx, this.claw.getState(), this.claw.t);
    FX.drawBack(ctx);
    if (this.revealed) {
      Art.winnerCard(ctx, {
        number: this.revealed.player,
        prize: this.revealed.prize,
        levelName: this.level.name,
        t: t,
        accuracy: this.revealed.accuracy,
      });
    }
    ctx.restore();

    this.drawHud(ctx, t);

    if (!this.revealed && this.claw.phase === 'miss') {
      Txt.draw(ctx, '差一点点…再来一次！', 320, 206, {
        size: 18,
        color: PLT.cream,
        align: 'center',
        outline: 2,
        outlineColor: PLT.redDeep,
      });
    }
    if (!this.revealed && this.claw.phase === 'aim' && this.claw.assist) {
      Txt.draw(ctx, '金福袋变大了，瞄准它！', 320, 286, {
        size: 11,
        color: PLT.goldLight,
        align: 'center',
        outline: 1,
      });
    }

    this.drawButtons(ctx, t);
  }

  drawHud(ctx, t) {
    const app = this.app;
    if (!app.session || !app.session.config) return;
    const levels = app.session.config.levels;
    const remain = remainingPlayers(app.session).length;

    Art.panel(ctx, { x: 12, y: 6, w: 320, h: 58, variant: 'dark' });
    Txt.draw(ctx, `第 ${this.levelIndex + 1}/${levels.length} 关 · ${this.level.name}`, 22, 14, {
      size: 14,
      color: PLT.gold,
    });
    Txt.draw(ctx, `奖品：${Txt.fit(this.level.prize, 196, { size: 10 })}`, 22, 36, {
      size: 10,
      color: PLT.cream,
    });

    Art.panel(ctx, { x: 344, y: 6, w: 284, h: 58, variant: 'dark' });
    Art.levelBadge(ctx, { x: 356, y: 16, difficulty: this.level.difficulty });
    Txt.draw(ctx, this.diff.label, 402, 14, { size: 11, color: PLT.goldLight });
    Txt.draw(ctx, `本关 ${this.slotNumber()}/${this.level.winners} 位`, 616, 14, {
      size: 12,
      color: PLT.cream,
      align: 'right',
    });
    Txt.draw(ctx, `奖池剩余 ${remain} 人`, 616, 34, {
      size: 10,
      color: PLT.greyLight,
      align: 'right',
    });

    // 底部操作提示
    if (!this.revealed) {
      Txt.draw(ctx, '←→ 移动 · 空格抓取', 100, 332, {
        size: 12,
        color: 'rgba(255,243,214,0.6)',
      });
    }
  }

  onPointerMove(p) {
    super.onPointerMove(p);
    if (this.revealed) return;
    const inside =
      p.x >= MACHINE.innerLeft && p.x <= MACHINE.innerRight && p.y >= MACHINE.y && p.y <= MACHINE.y + MACHINE.h;
    this.claw.setPointerX(inside ? p.x : null);
  }

  onPointerDown(p) {
    if (super.onPointerDown(p)) return;
    if (this.revealed) return;
    const inside = p.x >= MACHINE.x && p.x <= MACHINE.x + MACHINE.w && p.y >= MACHINE.y && p.y <= MACHINE.y + MACHINE.h;
    if (inside && this.claw.phase === 'aim') this.claw.drop();
  }

  onKeyDown(e) {
    if (e.code === 'Escape') {
      this.app.confirmAbandon();
      return;
    }
    if (this.revealed) {
      if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
        e.preventDefault();
        this.app.continueAfterDraw(this.revealed);
      }
      return;
    }
    this.claw.handleKeyDown(e);
  }

  onKeyUp(e) {
    if (!this.revealed) this.claw.handleKeyUp(e);
  }
}
