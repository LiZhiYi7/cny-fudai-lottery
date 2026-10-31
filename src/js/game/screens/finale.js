// 终场：烟花、全员中奖名单、兑奖入口。

import { BaseScreen } from '../screen.js';
import { Art, Txt, PLT } from '../../render/index.js';
import { sessionSummary } from '../../core/state.js';
import { audio } from '../audio.js';
import { FX } from '../../render/index.js';

export class FinaleScreen extends BaseScreen {
  constructor(app) {
    super(app);
    this.name = 'finale';
    this.fuse = 0.4;
  }

  enter() {
    this.summary = sessionSummary(this.app.session);
    this.fuse = 0.5;
    this.clearButtons();
    this.addButton({
      x: 150,
      y: 318,
      w: 150,
      h: 32,
      label: '查看兑奖清单',
      primary: true,
      onClick: () => this.app.openSheet(),
    });
    this.addButton({
      x: 316,
      y: 318,
      w: 140,
      h: 32,
      label: '开始新一局',
      onClick: () => this.app.confirmNewGame(),
    });
    this.addButton({
      x: 472,
      y: 318,
      w: 120,
      h: 30,
      label: '返回首页',
      onClick: () => this.app.goHome(),
    });
    audio.win();
    FX.firework(180, 100, { color: PLT.gold, count: 50, scale: 1.4 });
    FX.firework(460, 80, { color: PLT.red, count: 44, scale: 1.2 });
    FX.confetti(320, 90, 100, { up: false, speed: 140, life: 2.5 });
  }

  update(dt) {
    this.fuse -= dt;
    if (this.fuse <= 0) {
      this.fuse = 0.85 + Math.random() * 0.9;
      const colors = [PLT.gold, PLT.red, PLT.jade, PLT.pink, PLT.cyan];
      FX.firework(60 + Math.random() * 520, 52 + Math.random() * 120, {
        color: colors[Math.floor(Math.random() * colors.length)],
        count: 28 + Math.floor(Math.random() * 18),
        scale: 0.9 + Math.random() * 0.7,
      });
      if (Math.random() < 0.5) audio.firework();
    }
  }

  draw(ctx, t) {
    if (!this.app.session) return;
    Art.background(ctx, 'finale', t);
    Art.finale(ctx, t, this.summary);

    const levels = this.summary.levels;
    const px = 108;
    const py = 152;
    const pw = 424;
    const ph = 148;
    Art.panel(ctx, { x: px, y: py, w: pw, h: ph, variant: 'dark' });
    Txt.draw(ctx, '本局中奖名单', px + 14, py + 10, { size: 12, color: PLT.gold });

    const rowH = Math.min(26, (ph - 34) / Math.max(1, levels.length));
    levels.forEach((lv, i) => {
      const y = py + 32 + i * rowH;
      Txt.draw(ctx, Txt.fit(`${i + 1}. ${lv.name}`, 120, { size: 11 }), px + 14, y, {
        size: 11,
        color: PLT.cream,
      });
      Txt.draw(ctx, Txt.fit(lv.prize, 132, { size: 10 }), px + 138, y + 1, {
        size: 10,
        color: PLT.goldLight,
      });
      const winners = lv.winners.length ? lv.winners.map((n) => `${n}号`).join('、') : '—';
      Txt.draw(ctx, Txt.fit(winners, 130, { size: 10 }), px + pw - 14, y + 1, {
        size: 10,
        color: PLT.cream,
        align: 'right',
      });
    });

    Txt.draw(
      ctx,
      `共 ${this.summary.totalWinners} 位中奖 · ${this.summary.players} 位玩家 · ${this.summary.levels.length} 关全数开完`,
      320,
      300,
      { size: 12, color: PLT.greyLight, align: 'center' }
    );

    this.drawButtons(ctx, t);
  }
}
