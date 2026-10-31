// 玩家名单：数字序号令牌 + 关卡奖品预览。

import { BaseScreen } from '../screen.js';
import { Art, Txt, PLT, VIEW } from '../../render/index.js';
import { audio } from '../audio.js';

export class RosterScreen extends BaseScreen {
  constructor(app) {
    super(app);
    this.name = 'roster';
  }

  enter() {
    this.clearButtons();
    this.addButton({
      x: 436,
      y: 318,
      w: 168,
      h: 32,
      label: '开 始 抓 取',
      primary: true,
      onClick: () => this.app.beginLevel(0),
    });
    this.addButton({
      x: 24,
      y: 318,
      w: 90,
      h: 30,
      label: '返回',
      onClick: () => this.app.goHome(),
    });
    audio.startBgm();
  }

  draw(ctx, t) {
    const app = this.app;
    if (!app.session) return;
    const session = app.session;
    Art.background(ctx, 'stage', t);

    Txt.draw(ctx, `本轮玩家 · ${session.config.playerCount} 位`, 24, 20, {
      size: 19,
      color: PLT.gold,
      outline: 2,
    });
    Txt.draw(ctx, '只有数字序号 · 凭号码兑奖 · 中奖者移出奖池', 24, 48, {
      size: 10,
      color: PLT.greyLight,
    });

    // 玩家令牌
    const n = session.config.playerCount;
    const cols = Math.min(5, n);
    const rows = Math.ceil(n / cols);
    const gapX = 62;
    const gapY = 58;
    const gridW = (cols - 1) * gapX + 36;
    const startX = 24 + (320 - gridW) / 2 + 18;
    const startY = 106;
    for (let i = 0; i < n; i++) {
      const x = startX + (i % cols) * gapX;
      const y = startY + Math.floor(i / cols) * gapY;
      Art.playerToken(ctx, { number: i + 1, x, y, scale: 1, won: false, dim: false, t });
    }
    Txt.draw(ctx, `共 ${n} 人${rows > 4 ? '' : ''}`, 24, 296, {
      size: 10,
      color: PLT.greyLight,
    });

    // 关卡预览
    const levels = session.config.levels;
    const px = 360;
    const py = 82;
    const pw = 256;
    const ph = 210;
    Art.panel(ctx, { x: px, y: py, w: pw, h: ph, variant: 'dark' });
    Txt.draw(ctx, '关卡与奖品', px + 12, py + 9, { size: 12, color: PLT.gold });
    Txt.draw(ctx, `${levels.length} 关 · 共 ${levels.reduce((s, l) => s + l.winners, 0)} 份奖品`, px + 12, py + 28, {
      size: 9,
      color: PLT.greyLight,
    });

    const rowH = Math.min(24, 156 / Math.max(1, levels.length));
    levels.forEach((lv, i) => {
      const y = py + 48 + i * rowH;
      Txt.draw(ctx, `${i + 1}. ${Txt.fit(lv.name, 70, { size: 11 })}`, px + 12, y, {
        size: 11,
        color: PLT.cream,
      });
      Txt.draw(ctx, Txt.fit(lv.prize, 96, { size: 10 }), px + 92, y + 1, {
        size: 10,
        color: PLT.goldLight,
      });
      Txt.draw(ctx, `×${lv.winners}`, px + 196, y, { size: 10, color: PLT.greyLight });
      Art.levelBadge(ctx, { x: px + 226, y: y + 2, difficulty: lv.difficulty });
    });

    Txt.draw(ctx, '按空格开始第一关', 436, 300, {
      size: 10,
      color: PLT.grey,
      align: 'center',
    });

    this.drawButtons(ctx, t);
  }

  onKeyDown(e) {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      this.app.beginLevel(0);
    }
  }
}
