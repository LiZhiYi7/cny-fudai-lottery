// 关卡开场：奖品、名额、难度与 3-2-1 倒计时。

import { BaseScreen } from '../screen.js';
import { Art, Txt, PLT } from '../../render/index.js';
import { drawsOfLevel, remainingPlayers } from '../../core/state.js';
import { difficultyOf } from '../../core/constants.js';
import { audio } from '../audio.js';

export class IntroScreen extends BaseScreen {
  constructor(app, { levelIndex }) {
    super(app);
    this.name = 'intro';
    this.levelIndex = levelIndex;
    this.level = app.session.config.levels[levelIndex];
    this.total = app.session.config.levels.length;
    this.slot = drawsOfLevel(app.session, levelIndex).length;
    this.remain = remainingPlayers(app.session).length;
    this.timer = 0;
    this.lastCount = 4;
    this.started = false;
    this.frozen = !!app.freeze;
    this.diff = difficultyOf(this.level.difficulty);
    this.lastCount = 3;
  }

  enter() {
    this.clearButtons();
    this.addButton({
      x: 250,
      y: 318,
      w: 140,
      h: 32,
      label: this.frozen ? '开 始 抓 取' : '跳 过 倒 计 时',
      primary: true,
      onClick: () => this.begin(),
    });
    this.addButton({
      x: 24,
      y: 318,
      w: 90,
      h: 30,
      label: '返回首页',
      onClick: () => this.app.goHome(),
    });
    if (!this.frozen) audio.countdown(3);
  }

  begin() {
    if (this.started) return;
    this.started = true;
    this.app.beginLevel(this.levelIndex);
  }

  update(dt) {
    if (this.started || this.frozen) return;
    this.timer += dt;
    const n = 3 - Math.floor(this.timer);
    if (n >= 1 && n !== this.lastCount) {
      this.lastCount = n;
      audio.countdown(n);
    }
    if (this.timer >= 3.0) this.begin();
  }

  draw(ctx, t) {
    if (!this.app.session) return;
    Art.background(ctx, 'stage', t);
    Art.panel(ctx, { x: 84, y: 56, w: 472, h: 240, variant: 'red' });

    Txt.draw(ctx, `第 ${this.levelIndex + 1} / ${this.total} 关`, 320, 74, {
      size: 13,
      color: PLT.goldLight,
      align: 'center',
    });
    Txt.draw(ctx, Txt.fit(this.level.name, 380, { size: 18 }), 320, 98, {
      size: 18,
      color: PLT.cream,
      align: 'center',
      outline: 1,
    });

    Txt.draw(ctx, '本关奖品', 320, 132, { size: 10, color: PLT.greyLight, align: 'center' });
    Txt.draw(ctx, Txt.fit(this.level.prize, 400, { size: 28 }), 320, 152, {
      size: 28,
      color: PLT.gold,
      align: 'center',
      outline: 2,
      outlineColor: PLT.redDeep,
    });

    Art.levelBadge(ctx, { x: 286, y: 196, difficulty: this.level.difficulty });
    Txt.draw(
      ctx,
      `${this.diff.label} · 本关 ${this.level.winners} 份奖品 · 奖池 ${this.remain} 人`,
      320,
      216,
      { size: 11, color: PLT.cream, align: 'center' }
    );

    if (this.slot > 0) {
      Txt.draw(ctx, `已开出 ${this.slot}/${this.level.winners} 位，继续抓取`, 320, 236, {
        size: 10,
        color: '#ffb36b',
        align: 'center',
      });
    }

    const count = this.frozen ? 3 : Math.max(1, 3 - Math.floor(this.timer));
    const pulse = 1 + 0.08 * Math.sin(t * 8);
    Txt.digits(ctx, String(count), 320, 250, {
      unit: Math.round(6 * pulse),
      color: PLT.gold,
      align: 'center',
      valign: 'middle',
      outline: 2,
      outlineColor: PLT.redDeep,
    });
    Txt.draw(ctx, this.frozen ? '按空格或点击开始' : '准备抓福袋…', 320, 279, {
      size: 12,
      color: PLT.cream,
      align: 'center',
    });

    this.drawButtons(ctx, t);
  }

  onKeyDown(e) {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      this.begin();
    }
  }
}
