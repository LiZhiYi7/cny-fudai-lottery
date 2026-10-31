// 截图巡检：用 ?screen=... 调试路由 + 1920×1080 视口抓取关键界面。
// 运行：node scripts/qa-shots.mjs [--port=5182] [--only=home,roster]
// 输出：preview/qa/*.png
//
// 包含：
//   - 游戏界面：home / roster / intro / play / reveal / finale / sheet
//   - 后台：admin（PIN 门禁）、admin-panel（输入 8888 后的面板）、四个页签、
//           960×540 窄窗口面板（检查横向溢出）
//   - 2 人 / 20 人：首页与名单页（检查网格与布局溢出）
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from './serve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'preview', 'qa');
const DEFAULT_VIEWPORT = { width: 1920, height: 1080 };

const argv = process.argv.slice(2);
const getArg = (name, fallback) => {
  const hit = argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.includes('=') ? hit.split('=').slice(1).join('=') : fallback;
};

const PORT = Number(getArg('port', process.env.SHOT_PORT || 5182));
const ONLY = (getArg('only', '') || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const BASE_LEVELS = [
  { id: 'shot_l1', name: '第一关', prize: '暖心保温杯', winners: 3, difficulty: 'easy' },
  { id: 'shot_l2', name: '第二关', prize: '无线蓝牙耳机', winners: 2, difficulty: 'normal' },
  { id: 'shot_l3', name: '第三关', prize: '智能手表', winners: 1, difficulty: 'hard' },
  { id: 'shot_l4', name: '特等奖', prize: '神秘大奖', winners: 1, difficulty: 'extreme' },
];

function configFor(playerCount) {
  // 人数少时收缩关卡名额，保证调试路由不会因校验失败回退到默认配置
  const levels =
    playerCount >= 7
      ? BASE_LEVELS
      : [
          { id: 'shot_l1', name: '第一关', prize: '暖心保温杯', winners: 1, difficulty: 'easy' },
          { id: 'shot_l2', name: '第二关', prize: '无线蓝牙耳机', winners: 1, difficulty: 'normal' },
        ];
  return {
    schema: 1,
    title: '新春福袋抓抓乐',
    playerCount,
    allowRepeatWin: false,
    sound: true,
    bgm: true,
    pin: '8888',
    levels: levels.map((lv) => ({ ...lv })),
  };
}

// route 使用 app.js 的调试路由；wait 为等待动画/弹层出现的毫秒数
const SHOTS = [
  { name: 'home', route: 'home', wait: 900 },
  { name: 'roster', route: 'roster', wait: 900 },
  { name: 'intro', route: 'intro', wait: 1100 },
  { name: 'play', route: 'play', wait: 1300 },
  { name: 'reveal', route: 'reveal', wait: 2400 },
  { name: 'finale', route: 'finale', wait: 1600 },
  { name: 'sheet', route: 'sheet', wait: 2000 },
  // PIN 门禁页
  { name: 'admin', route: 'admin', wait: 2000, validate: false },
  // 输入密码后的后台面板（四个页签 + 960 窄窗口）
  { name: 'admin-panel', route: 'admin', wait: 900, kind: 'admin-panel', validate: false },
  {
    name: 'admin-panel-960',
    route: 'admin',
    wait: 900,
    kind: 'admin-panel',
    validate: false,
    viewport: { width: 960, height: 540 },
  },
];

const ADMIN_TABS = ['settings', 'levels', 'records', 'data'];

function shotPath(name) {
  return path.join(OUT_DIR, `${name}.png`);
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function launchBrowser(chromium) {
  const attempts = [];
  attempts.push({ label: 'chrome channel', run: () => chromium.launch({ channel: 'chrome', headless: true }) });
  if (process.env.CHROME_PATH) {
    attempts.push({
      label: `CHROME_PATH=${process.env.CHROME_PATH}`,
      run: () => chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true }),
    });
  }
  for (const exe of [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  ]) {
    if (exe && (await fileExists(exe))) {
      attempts.push({ label: exe, run: () => chromium.launch({ executablePath: exe, headless: true }) });
    }
  }
  const errors = [];
  for (const attempt of attempts) {
    try {
      const browser = await attempt.run();
      console.log(`[shots] 浏览器启动成功（${attempt.label}）`);
      return browser;
    } catch (err) {
      errors.push(`${attempt.label}: ${(err && err.message ? err.message : String(err)).split('\n')[0]}`);
    }
  }
  throw new Error(
    '无法启动 headless Chrome。请安装 Chrome，或设置 CHROME_PATH。\n' + errors.map((e) => '  - ' + e).join('\n')
  );
}

/** 页面稳定后测量舞台是否溢出。 */
async function measureStage(page) {
  return page.evaluate(() => {
    const frame = document.getElementById('stage-frame');
    const rect = frame ? frame.getBoundingClientRect() : null;
    return rect
      ? {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          innerW: window.innerWidth,
          innerH: window.innerHeight,
          scrollW: document.documentElement.scrollWidth,
          scrollH: document.documentElement.scrollHeight,
        }
      : null;
  });
}

function stageProblems(layout) {
  const problems = [];
  if (!layout) return ['找不到 #stage-frame'];
  if (layout.left < -0.5 || layout.top < -0.5) problems.push('画面上/左溢出');
  if (layout.right > layout.innerW + 0.5 || layout.bottom > layout.innerH + 0.5) problems.push('画面下/右溢出');
  if (layout.scrollW > layout.innerW + 1 || layout.scrollH > layout.innerH + 1) problems.push('出现滚动条');
  return problems;
}

/** 打开后台：等 PIN 门禁 → 输入 8888 → 等面板。返回面板测量信息。 */
async function unlockAdmin(page, isNarrow) {
  await page.waitForSelector('.admin-gate-card', { timeout: 8000 });
  await page.fill('.admin-pin-input', '8888');
  await page.press('.admin-pin-input', 'Enter');
  await page.waitForSelector('.admin-panel', { timeout: 8000 });
  await page.waitForTimeout(400);

  let slotbarSeen = false;
  if (!isNarrow) {
    // 逐个页签截图（settings 已在入口截图）
    for (const tab of ADMIN_TABS) {
      await page.click(`.admin-tab[data-tab="${tab}"]`);
      await page.waitForTimeout(350);
      if (tab === 'levels') {
        slotbarSeen = await page.evaluate(() => !!document.querySelector('.adm-slotbar'));
      }
      await page.screenshot({ path: shotPath(`admin-tab-${tab}`) });
    }
    // 回到基础设置，作为 admin-panel.png 的主视图
    await page.click('.admin-tab[data-tab="settings"]');
    await page.waitForTimeout(300);
  } else {
    await page.click('.admin-tab[data-tab="levels"]');
    await page.waitForTimeout(350);
    slotbarSeen = await page.evaluate(() => !!document.querySelector('.adm-slotbar'));
  }

  return page.evaluate((slotbarSeenArg) => {
    const panel = document.querySelector('.admin-panel');
    const body = document.querySelector('.admin-body');
    const rect = panel ? panel.getBoundingClientRect() : null;
    return {
      panel: rect
        ? { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
        : null,
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      docScrollW: document.documentElement.scrollWidth,
      tabs: [...document.querySelectorAll('.admin-tab')].map((b) => b.textContent.trim()),
      tabCount: document.querySelectorAll('.admin-tab').length,
      hasSlotbar: slotbarSeenArg,
      bodyOverflowY: body ? getComputedStyle(body).overflowY : '',
      bodyScrollable: body ? body.scrollHeight > body.clientHeight : false,
      panelOverflow: panel ? panel.scrollWidth > panel.clientWidth + 1 : false,
      toast: (document.querySelector('#toast-root .toast.error') || {}).textContent || '',
    };
  }, slotbarSeen);
}

async function main() {
  let server = null;
  let browser = null;
  const results = [];

  try {
    await fs.mkdir(OUT_DIR, { recursive: true });

    let chromium = null;
    try {
      ({ chromium } = await import('playwright-core'));
    } catch {
      console.error('[shots] 缺少依赖 playwright-core，请先运行 npm install');
      process.exitCode = 1;
      return;
    }

    server = await startServer({ port: PORT });
    const base = server.url;
    console.log(`[shots] 服务器：${base}`);
    browser = await launchBrowser(chromium);

    const scenarios = [];
    for (const shot of SHOTS) {
      if (!ONLY.length || ONLY.includes(shot.name)) scenarios.push({ shot });
    }
    // 2 人 / 20 人名单与首页（检查网格是否溢出）
    for (const count of [2, 20]) {
      for (const route of ['roster', 'home']) {
        const name = `${route}-${count}p`;
        if (!ONLY.length || ONLY.includes(name)) {
          scenarios.push({
            shot: { name, route, wait: 900, validate: true },
            config: configFor(count),
          });
        }
      }
    }

    for (const scenario of scenarios) {
      const { shot } = scenario;
      const viewport = shot.viewport || DEFAULT_VIEWPORT;
      const context = await browser.newContext({ viewport });
      const pageErrors = [];
      const consoleErrors = [];
      const missing = [];
      try {
        const page = await context.newPage();
        page.on('pageerror', (err) =>
          pageErrors.push('pageerror: ' + (err && err.message ? err.message : String(err)))
        );
        page.on('console', (msg) => {
          if (msg.type() !== 'error') return;
          const text = msg.text();
          // 404 资源噪音单独统计 URL，见下方 missing
          if (/Failed to load resource|404 \(Not Found\)/.test(text)) return;
          consoleErrors.push(text);
        });
        page.on('response', (res) => {
          if (res.status() === 404) missing.push(res.url());
        });
        if (scenario.config) {
          await page.addInitScript(
            ({ key, value }) => {
              try {
                window.localStorage.setItem(key, value);
              } catch {
                /* ignore */
              }
            },
            { key: 'cnyfudai:config.json', value: JSON.stringify(scenario.config) }
          );
        }
        await page.goto(`${base}/?screen=${shot.route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector('#stage', { timeout: 15000 });
        await page.waitForTimeout(shot.wait);

        const problems = [];
        let adminInfo = null;

        if (shot.kind === 'admin-panel') {
          adminInfo = await unlockAdmin(page, shot.name.endsWith('-960'));
          if (!adminInfo.panel) problems.push('后台面板未渲染');
          else {
            if (adminInfo.panel.right > adminInfo.innerW + 0.5 || adminInfo.panel.left < -0.5)
              problems.push('后台面板横向溢出');
            if (adminInfo.panel.bottom > adminInfo.innerH + 0.5) problems.push('后台面板纵向溢出');
            if (adminInfo.docScrollW > adminInfo.innerW + 1) problems.push('页面出现横向滚动');
          }
          if (adminInfo && adminInfo.tabCount !== 4) problems.push(`页签数量应为 4，实际 ${adminInfo.tabCount}`);
          if (adminInfo && adminInfo.panelOverflow) problems.push('后台面板内部出现横向溢出');
          if (adminInfo && adminInfo.bodyOverflowY !== 'auto') problems.push(`.admin-body 应可滚动，实际 ${adminInfo.bodyOverflowY}`);
          if (!shot.name.endsWith('-960') && adminInfo && !adminInfo.hasSlotbar)
            problems.push('未找到 .adm-slotbar');
          if (adminInfo && adminInfo.toast) problems.push('出现错误 toast：' + adminInfo.toast);
          await page.screenshot({ path: shotPath(shot.name) });
        } else {
          if (shot.validate !== false) {
            problems.push(...stageProblems(await measureStage(page)));
          }
          if (shot.route === 'admin') {
            const gate = await page.evaluate(() => {
              const root = document.querySelector('.admin-root');
              return {
                open: !!root && root.classList.contains('open'),
                gate: !!document.querySelector('.admin-gate-card'),
              };
            });
            if (!gate.gate) problems.push('PIN 门禁未渲染（admin 模块可能未合入）');
          }
          await page.screenshot({ path: shotPath(shot.name) });
        }

        const size = await fs.stat(shotPath(shot.name)).then((s) => `${(s.size / 1024).toFixed(1)}KB`);
        const note = [...problems];
        if (pageErrors.length) note.push(`pageerror×${pageErrors.length}`);
        if (consoleErrors.length) note.push(`console.error×${consoleErrors.length}`);
        const missingUnique = [...new Set(missing)];
        if (missingUnique.length) note.push(`404：${missingUnique.join(' , ')}`);
        // favicon 之类 404 不算问题；其它资源缺失（CSS/JS）视为失败
        const significantMissing = missingUnique.filter(
          (u) => !/favicon|apple-touch-icon|\.ico($|\?)/i.test(u)
        );
        if (significantMissing.length) problems.push('关键资源 404');
        if (pageErrors.length) problems.push('页面脚本报错');
        results.push({ name: shot.name, ok: problems.length === 0, note: note.join('；'), size });

        console.log(
          `[shots] ${shot.name.padEnd(16)} → preview/qa/${shot.name}.png  ${size}${
            note.length ? '  ⚠ ' + note.join('；') : ''
          }`
        );
        if (adminInfo) {
          console.log(
            `        面板 ${adminInfo.panel ? `${Math.round(adminInfo.panel.right - adminInfo.panel.left)}×${Math.round(
              adminInfo.panel.bottom - adminInfo.panel.top
            )}` : '未渲染'} · 页签 ${adminInfo.tabs.join(' / ')} · 面板可滚动=${adminInfo.bodyScrollable}`
          );
        }
        if (pageErrors.length) {
          console.log('        pageerror：');
          for (const e of pageErrors.slice(0, 5)) console.log('          - ' + e);
        }
        if (consoleErrors.length) {
          console.log('        console.error：');
          for (const e of consoleErrors.slice(0, 5)) console.log('          - ' + e);
        }
      } finally {
        await context.close();
      }
    }
    // ---- sandbox.html 素材总览：需要以项目根为静态目录（页面引用 ./src/...）----
    const wantSandbox = !ONLY.length || ONLY.includes('sandbox') || ONLY.includes('sandbox-fx');
    if (wantSandbox) {
      let sandboxServer = null;
      try {
        sandboxServer = await startServer({ port: PORT + 2, root: ROOT });
        const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
        try {
          const page = await context.newPage();
          const sandboxErrors = [];
          page.on('pageerror', (err) =>
            sandboxErrors.push('pageerror: ' + (err && err.message ? err.message : String(err)))
          );
          page.on('console', (msg) => {
            if (msg.type() !== 'error') return;
            const text = msg.text();
            if (/favicon|Failed to load resource|404 \(Not Found\)/.test(text)) return;
            sandboxErrors.push('console.error: ' + text);
          });

          await page.goto(`${sandboxServer.url}/sandbox.html`, { waitUntil: 'load' });
          await page.waitForSelector('canvas.demo', { timeout: 15000 });
          await page.waitForTimeout(1800);
          await page.screenshot({ path: shotPath('sandbox') });

          // sandbox 用 IntersectionObserver 只绘制可见画布；逐块滚动一遍让 15 个画布都出过帧，
          // 再统一读像素，避免把“尚未滚动到”误判成黑屏。
          const canvasIds = await page.$$eval('canvas.demo', (els) => els.map((c) => c.id));
          for (const id of canvasIds) {
            await page
              .locator(`#${id}`)
              .scrollIntoViewIfNeeded()
              .catch(() => {});
            await page.waitForTimeout(120);
          }

          const stats = await page.evaluate(() => {
            return [...document.querySelectorAll('canvas.demo')].map((c) => {
              const ctx = c.getContext('2d');
              const w = c.width;
              const h = c.height;
              let bright = 0;
              try {
                const data = ctx.getImageData(0, 0, w, h).data;
                // 采样，阈值高于背景色 #07040a，用于判断画布是否真的画了东西
                for (let i = 0; i < data.length; i += 4 * 53) {
                  if (data[i] + data[i + 1] + data[i + 2] > 45) bright += 1;
                }
              } catch {
                /* getImageData 失败时按 0 处理 */
              }
              return { id: c.id, w, h, bright };
            });
          });

          const problems = [];
          const blank = stats.filter((s) => s.bright === 0);
          const wrongSize = stats.filter((s) => s.w !== 640 || s.h !== 360);
          if (stats.length < 15) problems.push(`素材画布数量不足（${stats.length}，预期 15）`);
          if (blank.length) problems.push(`黑屏画布：${blank.map((s) => s.id).join(',')}`);
          if (wrongSize.length) problems.push(`画布尺寸错误：${wrongSize.map((s) => s.id).join(',')}`);
          if (sandboxErrors.length) problems.push(`页面报错×${sandboxErrors.length}`);

          // 再滚到粒子区：先点几个特效按钮，让粒子出现在画面里，再截粒子区
          for (const kind of ['firework', 'coin', 'confetti', 'sparks']) {
            await page
              .locator(`#fx-buttons [data-fx="${kind}"]`)
              .scrollIntoViewIfNeeded()
              .catch(() => {});
            await page
              .locator(`#fx-buttons [data-fx="${kind}"]`)
              .click({ timeout: 3000 })
              .catch(() => {});
            await page.waitForTimeout(120);
          }
          await page
            .locator('#g-fx')
            .scrollIntoViewIfNeeded()
            .catch(() => {});
          await page.waitForTimeout(450);
          await page.screenshot({ path: shotPath('sandbox-fx') });

          const size = await fs.stat(shotPath('sandbox')).then((s) => `${(s.size / 1024).toFixed(1)}KB`);
          results.push({
            name: 'sandbox',
            ok: problems.length === 0,
            note: problems.join('；') || `${stats.length} 个画布均有绘制`,
            size,
          });
          console.log(`[shots] sandbox          → preview/qa/sandbox.png + sandbox-fx.png  ${size}`);
          console.log(`        canvas=${stats.length}，空白=${blank.length}，尺寸异常=${wrongSize.length}`);
          if (sandboxErrors.length) {
            console.log('        pageerror/console.error：');
            for (const e of sandboxErrors.slice(0, 5)) console.log('          - ' + e);
          }
        } finally {
          await context.close();
        }
      } catch (err) {
        results.push({
          name: 'sandbox',
          ok: false,
          note: '素材总览截图失败：' + (err && err.message ? err.message : String(err)),
          size: '-',
        });
        console.error('[shots] sandbox 失败：', err);
      } finally {
        if (sandboxServer) await sandboxServer.close().catch(() => {});
      }
    }
  } catch (err) {
    results.push({ name: '初始化', ok: false, note: err && err.message ? err.message : String(err), size: '-' });
    console.error('[shots] 失败：', err);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
  }

  const failed = results.filter((r) => !r.ok);
  console.log('');
  console.log('=============== 截图巡检结果 ===============');
  for (const r of results) {
    console.log(`  ${r.ok ? '✓' : '✗'} ${r.name.padEnd(16)} ${r.size.padStart(8)} ${r.note}`);
  }
  console.log(`共 ${results.length} 张，失败 ${failed.length} 张；输出目录：preview/qa/`);
  console.log('============================================');
  if (failed.length) process.exitCode = 1;
}

await main();
