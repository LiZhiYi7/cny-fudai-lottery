// 应用主控：启动、路由、输入、持久化、结算推进。

import { Render, FX, VIEW, Txt } from '../render/index.js';
import { storage } from '../core/storage.js';
import { normalizeConfig, validateConfig } from '../core/validate.js';
import { APP, createDefaultConfig } from '../core/constants.js';
import {
  createSession,
  nextOpenLevelIndex,
  isLevelComplete,
  finishSession,
  abandonSession,
  sessionSummary,
  recordDraw,
  remainingPlayers,
} from '../core/state.js';
import { audio } from './audio.js';
import { HomeScreen } from './screens/home.js';
import { RosterScreen } from './screens/roster.js';
import { IntroScreen } from './screens/intro.js';
import { PlayScreen } from './screens/play.js';
import { FinaleScreen } from './screens/finale.js';
import { ResultSheet } from './sheet.js';
import { toast, confirmDialog } from './ui.js';

function isValidSession(session) {
  if (!session || typeof session !== 'object') return false;
  const cfg = session.config;
  if (!cfg || !Array.isArray(cfg.levels) || !Number.isInteger(cfg.playerCount)) return false;
  if (!Array.isArray(session.draws)) return false;
  if (!['playing', 'finished', 'abandoned'].includes(session.status)) return false;
  if (cfg.levels.length === 0) return false;
  for (const d of session.draws) {
    if (!Number.isInteger(d.player) || d.player < 1 || d.player > cfg.playerCount) return false;
    if (!Number.isInteger(d.levelIndex) || d.levelIndex < 0 || d.levelIndex >= cfg.levels.length) return false;
  }
  return true;
}

export class App {
  constructor(canvas) {
    this.canvas = canvas;
    this.version = APP.version;
    this.config = normalizeConfig(createDefaultConfig());
    this.session = null;
    this.screen = null;
    this.screenName = '';
    this.pointer = { x: -999, y: -999 };
    this.t = 0;
    this.last = 0;
    this.debugMode = false;
    this.freeze = false;
    this.dataDirLabel = '';
    this.sheet = null;
    this._cursor = '';
    this._loop = this.loop.bind(this);
    this._onKey = this.onWindowKey.bind(this);
    this._onKeyUp = this.onWindowKeyUp.bind(this);
  }

  async boot() {
    Render.init(this.canvas);
    await Txt.load();
    this.bindInput();

    const saved = await storage.readJSON('config.json');
    this.config = normalizeConfig(saved || createDefaultConfig());
    if (!saved) await this.persistConfig();

    const savedSession = await storage.readJSON('results.json');
    this.session = isValidSession(savedSession) ? savedSession : null;

    this.applyAudio();
    this.dataDirLabel = await storage.dataDir();
    if (window.native && window.native.setDirty) {
      window.native.setDirty(!!this.session && this.session.status === 'playing');
    }

    const params = new URLSearchParams(window.location.search);
    this.freeze = params.has('freeze');
    if (params.has('test')) this.exposeTestApi();

    const routed = await this.handleDebugRoute(params.get('screen'));
    if (!routed) this.setScreen(new HomeScreen(this));

    requestAnimationFrame(this._loop);
  }

  bindInput() {
    this.canvas.addEventListener('pointermove', (e) => {
      const p = Render.pointer(e);
      this.pointer = p;
      if (this.screen) this.screen.onPointerMove(p);
    });
    this.canvas.addEventListener('pointerdown', (e) => {
      audio.ensure();
      const p = Render.pointer(e);
      this.pointer = p;
      if (this.screen) this.screen.onPointerDown(p);
    });
    this.canvas.addEventListener('pointerleave', () => {
      this.setCursor('default');
    });
    window.addEventListener('keydown', this._onKey);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.last = 0;
    });
  }

  overlayOpen() {
    return !!document.querySelector('.admin-root.open, .modal-backdrop, .sheet-backdrop');
  }

  onWindowKey(e) {
    audio.ensure();
    if (e.code === 'F11') {
      e.preventDefault();
      this.toggleFullscreen();
      return;
    }
    if (this.overlayOpen()) return;
    if (this.screen && this.screen.onKeyDown) this.screen.onKeyDown(e);
  }

  onWindowKeyUp(e) {
    if (this.overlayOpen()) return;
    if (this.screen && this.screen.onKeyUp) this.screen.onKeyUp(e);
  }

  async loop(ts) {
    const now = ts / 1000;
    const dt = this.last ? Math.min(0.05, now - this.last) : 0.016;
    this.last = now;
    this.t += dt;
    FX.update(dt);
    if (this.screen) this.screen.update(dt, this.t);
    Render.begin();
    if (this.screen) this.screen.draw(Render.ctx, this.t);
    FX.drawFront(Render.ctx);
    Render.end();
    requestAnimationFrame(this._loop);
  }

  setScreen(screen) {
    try {
      if (this.screen && this.screen.exit) this.screen.exit();
    } catch (err) {
      console.warn(err);
    }
    this.screen = screen;
    this.screenName = screen && screen.name ? screen.name : '';
    this.pointer = { x: -999, y: -999 };
    this.setCursor('default');
    try {
      if (screen && screen.enter) screen.enter();
    } catch (err) {
      console.error(err);
      toast('界面初始化失败：' + (err && err.message ? err.message : err), 'error');
    }
  }

  setCursor(cursor) {
    if (this._cursor !== cursor) {
      this._cursor = cursor;
      if (this.canvas) this.canvas.style.cursor = cursor;
    }
  }

  // ---------- 导航 ----------
  goHome() {
    this.setScreen(new HomeScreen(this));
  }

  goFinale() {
    this.setScreen(new FinaleScreen(this));
  }

  beginLevel(levelIndex) {
    this.setScreen(new PlayScreen(this, { levelIndex }));
  }

  async resumeGame() {
    const session = this.session;
    if (!session || session.status !== 'playing') {
      this.goHome();
      return;
    }
    const levelIndex = nextOpenLevelIndex(session);
    if (levelIndex < 0) {
      finishSession(session);
      await this.persistSession();
      this.setScreen(new FinaleScreen(this));
      return;
    }
    this.setScreen(new IntroScreen(this, { levelIndex }));
  }

  async continueAfterDraw(draw) {
    const session = this.session;
    if (!session || !draw) return;
    if (!isLevelComplete(session, draw.levelIndex)) {
      this.setScreen(new PlayScreen(this, { levelIndex: draw.levelIndex }));
      return;
    }
    const next = nextOpenLevelIndex(session);
    if (next < 0) {
      finishSession(session);
      await this.persistSession();
      this.setScreen(new FinaleScreen(this));
      return;
    }
    this.setScreen(new IntroScreen(this, { levelIndex: next }));
  }

  async confirmNewGame() {
    const check = validateConfig(this.config);
    if (!check.ok) {
      toast(check.errors[0].message, 'error');
      await this.openAdmin();
      return;
    }
    const hasDraws = !!(this.session && this.session.draws && this.session.draws.length);
    const playing = !!(this.session && this.session.status === 'playing');
    if (hasDraws) {
      const ok = await confirmDialog({
        title: playing ? '对局还没结束' : '开始新的一局',
        message: playing
          ? '当前对局会归档保存，然后按最新的人数与奖品重新开始。确定吗？'
          : '上一局记录会归档保存，兑奖清单仍可在后台查看。确定开始新一局吗？',
        okText: '开始新一局',
        cancelText: '再想想',
      });
      if (!ok) return;
    }
    await this.startNewGame();
  }

  async startNewGame() {
    const check = validateConfig(this.config);
    if (!check.ok) {
      toast(check.errors[0].message, 'error');
      return;
    }
    if (this.session && this.session.draws && this.session.draws.length) {
      try {
        await storage.archiveSession(this.session);
      } catch (err) {
        console.warn('archive failed', err);
      }
    }
    this.debugMode = false;
    this.session = createSession(this.config);
    await this.persistSession(true);
    FX.clear();
    this.setScreen(new RosterScreen(this));
  }

  async confirmAbandon() {
    if (!this.session || this.session.status !== 'playing') {
      this.goHome();
      return;
    }
    const ok = await confirmDialog({
      title: '退出本局？',
      message: '已开出的中奖记录会保留，可在首页或后台查看兑奖清单；剩余名额不会自动补抽。',
      okText: '退出本局',
      cancelText: '继续抓取',
      danger: true,
    });
    if (!ok) return;
    abandonSession(this.session);
    await this.persistSession();
    this.goHome();
  }

  // ---------- 兑奖 / 后台 ----------
  openSheet() {
    if (this.sheet && this.sheet.el) {
      this.sheet.updateMeta();
      return;
    }
    this.sheet = new ResultSheet(this);
    this.sheet.open();
  }

  async openAdmin() {
    audio.ensure();
    try {
      const mod = await import('../admin/admin.js');
      await mod.openAdmin({
        config: this.config,
        session: this.session,
        dataDirLabel: this.dataDirLabel,
        onConfigChange: async (next) => {
          this.config = normalizeConfig(next);
          await this.persistConfig();
          this.applyAudio();
          if (this.screen && this.screen.rebuild) this.screen.rebuild();
        },
        onSessionChange: async (next) => {
          this.session = next;
          await this.persistSession(true);
          if (!next) {
            if (this.screenName !== 'home') this.goHome();
            else if (this.screen && this.screen.rebuild) this.screen.rebuild();
            return;
          }
          if (this.screen && this.screen.rebuild) this.screen.rebuild();
        },
        onClose: () => {
          if (this.screen && this.screen.rebuild) this.screen.rebuild();
        },
      });
    } catch (err) {
      console.error(err);
      toast('后台管理暂时不可用：' + (err && err.message ? err.message : err), 'error');
    }
  }

  // ---------- 设置 ----------
  applyAudio() {
    audio.setEnabled(!!this.config.sound);
    audio.setBgm(!!this.config.bgm);
  }

  async toggleSound() {
    this.config.sound = !this.config.sound;
    audio.setEnabled(this.config.sound);
    await this.persistConfig();
    if (this.screen && this.screen.rebuild) this.screen.rebuild();
    toast(this.config.sound ? '音效已开启' : '音效已关闭');
  }

  async toggleFullscreen() {
    if (window.native && window.native.toggleFullscreen) {
      const fs = await window.native.toggleFullscreen().catch(() => false);
      toast(fs ? '已进入全屏（F11 退出）' : '已退出全屏');
      return;
    }
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      toast('当前环境不支持全屏', 'error');
    }
  }

  async requestQuit() {
    const ok = await confirmDialog({
      title: '退出游戏',
      message: '中奖记录会自动保存，下次打开可以从首页继续或查看兑奖清单。确定退出吗？',
      okText: '退出',
      cancelText: '取消',
      danger: true,
    });
    if (!ok) return;
    if (window.native && window.native.quit) window.native.quit();
    else window.close();
  }

  // ---------- 持久化 ----------
  async persistConfig() {
    if (this.debugMode) return;
    await storage.writeJSON('config.json', this.config);
  }

  async persistSession(force = false) {
    if (this.debugMode && !force) return;
    if (this.session || force) await storage.writeJSON('results.json', this.session);
    if (window.native && window.native.setDirty) {
      window.native.setDirty(!!this.session && this.session.status === 'playing');
    }
  }

  // ---------- 调试路由与测试钩子 ----------
  async handleDebugRoute(name) {
    if (!name) return false;
    this.debugMode = true;
    const params = new URLSearchParams(window.location.search);
    const check = validateConfig(this.config);
    const cfg = check.ok ? this.config : normalizeConfig(createDefaultConfig());
    const fresh = () => createSession(cfg);
    switch (name) {
      case 'home':
        this.setScreen(new HomeScreen(this));
        return true;
      case 'roster':
        this.session = fresh();
        this.setScreen(new RosterScreen(this));
        return true;
      case 'intro':
        this.session = fresh();
        this.setScreen(new IntroScreen(this, { levelIndex: 0 }));
        return true;
      case 'play':
        this.session = fresh();
        this.setScreen(new PlayScreen(this, { levelIndex: 0 }));
        return true;
      case 'reveal':
        this.session = fresh();
        this.setScreen(new PlayScreen(this, { levelIndex: 0 }));
        setTimeout(() => {
          if (this.screen && this.screen.forceWin) this.screen.forceWin();
        }, 800);
        return true;
      case 'finale':
        this.session = this.buildDemoSession(cfg);
        finishSession(this.session);
        this.setScreen(new FinaleScreen(this));
        return true;
      case 'sheet':
        this.session = this.buildDemoSession(cfg);
        finishSession(this.session);
        this.setScreen(new FinaleScreen(this));
        setTimeout(() => this.openSheet(), 500);
        return true;
      case 'admin':
        this.setScreen(new HomeScreen(this));
        setTimeout(() => this.openAdmin(), 500);
        return true;
      default:
        this.debugMode = false;
        return false;
    }
  }

  buildDemoSession(cfg) {
    const session = createSession(cfg);
    for (let i = 0; i < cfg.levels.length; i++) {
      const lv = cfg.levels[i];
      for (let k = 0; k < lv.winners; k++) {
        const pool = remainingPlayers(session);
        if (!pool.length) break;
        recordDraw(session, { levelIndex: i, player: pool[0], accuracy: 0.9 });
      }
    }
    return session;
  }

  exposeTestApi() {
    const app = this;
    window.__gameTest = {
      app,
      get config() {
        return app.config;
      },
      get session() {
        return app.session;
      },
      get screenName() {
        return app.screenName;
      },
      get summary() {
        return app.session ? sessionSummary(app.session) : null;
      },
      async setConfig(cfg) {
        app.debugMode = false;
        app.config = normalizeConfig(cfg);
        await app.persistConfig();
        await app.startNewGame();
      },
      async startNewGame() {
        app.debugMode = false;
        await app.startNewGame();
      },
      async resume() {
        await app.resumeGame();
      },
      click(x, y) {
        if (app.screen) app.screen.onPointerDown({ x, y });
      },
      move(x, y) {
        if (app.screen) app.screen.onPointerMove({ x, y });
      },
      key(code) {
        if (!app.screen) return;
        const e = { code, key: code, preventDefault() {} };
        app.screen.onKeyDown(e);
        app.screen.onKeyUp(e);
      },
      forceWin(player) {
        if (app.screen && app.screen.forceWin) app.screen.forceWin(player);
      },
      async continue() {
        if (app.screen && app.screen.revealed) await app.continueAfterDraw(app.screen.revealed);
      },
      async openSheet() {
        app.openSheet();
      },
      async openAdmin() {
        await app.openAdmin();
      },
      async openHome() {
        app.goHome();
      },
    };
  }
}
