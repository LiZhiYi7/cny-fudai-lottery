// 首页：标题、继续/新开、兑奖清单、后台、音效与退出。

import { BaseScreen } from '../screen.js';
import { Art, Txt, PLT } from '../../render/index.js';
import { sessionSummary } from '../../core/state.js';
import { formatDateTime } from '../../core/format.js';
import { audio } from '../audio.js';

export class HomeScreen extends BaseScreen {
  constructor(app) {
    super(app);
    this.name = 'home';
  }

  enter() {
    this.rebuild();
  }

  rebuild() {
    this.clearButtons();
    const app = this.app;
    const playing = app.session && app.session.status === 'playing';
    const hasDraws = (app.session && app.session.draws && app.session.draws.length) > 0;
    const cx = 320;
    let y = 184;

    if (playing) {
      this.addButton({
        x: cx - 110,
        y,
        w: 220,
        h: 44,
        label: '继 续 上 一 局',
        primary: true,
        onClick: () => app.resumeGame(),
      });
      y += 54;
      this.addButton({
        x: cx - 100,
        y,
        w: 200,
        h: 32,
        label: '放弃并开始新一局',
        onClick: () => app.confirmNewGame(),
      });
      y += 42;
    } else {
      this.addButton({
        x: cx - 110,
        y,
        w: 220,
        h: 44,
        label: hasDraws ? '开 始 新 一 局' : '开 始 抽 奖',
        primary: true,
        onClick: () => app.confirmNewGame(),
      });
      y += 54;
      if (hasDraws) {
        this.addButton({
          x: cx - 100,
          y,
          w: 200,
          h: 32,
          label: '查看兑奖清单',
          onClick: () => app.openSheet(),
        });
        y += 42;
      }
    }

    this.addButton({
      x: cx - 100,
      y,
      w: 200,
      h: 32,
      label: '后台管理',
      onClick: () => app.openAdmin(),
    });

    this.addButton({
      x: 24,
      y: 318,
      w: 96,
      h: 30,
      label: app.config.sound ? '音效 开' : '音效 关',
      onClick: () => app.toggleSound(),
    });
    this.addButton({
      x: 130,
      y: 318,
      w: 96,
      h: 30,
      label: '全屏 F11',
      onClick: () => app.toggleFullscreen(),
    });
    this.addButton({
      x: 524,
      y: 318,
      w: 92,
      h: 30,
      label: '退出游戏',
      onClick: () => app.requestQuit(),
    });
  }

  draw(ctx, t) {
    const app = this.app;
    Art.background(ctx, 'home', t);
    Art.title(ctx, t);

    if (app.session) {
      const sum = sessionSummary(app.session);
      let text;
      if (app.session.status === 'playing') {
        const done = sum.levels.filter((l) => l.complete).length;
        text = `未完成的对局 · 已通过 ${done}/${sum.levels.length} 关 · 已中奖 ${sum.totalWinners}/${sum.totalSlots} 人 · 玩家 ${sum.players} 位`;
      } else {
        text = `上一局 · 已中奖 ${sum.totalWinners} 人 · ${formatDateTime(
          app.session.finishedAt || app.session.createdAt
        )}`;
      }
      Txt.draw(ctx, text, 320, 152, { size: 11, color: PLT.greyLight, align: 'center' });
    } else {
      Txt.draw(ctx, '每人一个数字序号，凭号码兑奖', 320, 154, {
        size: 11,
        color: PLT.greyLight,
        align: 'center',
      });
    }

    this.drawButtons(ctx, t);
  }
}
