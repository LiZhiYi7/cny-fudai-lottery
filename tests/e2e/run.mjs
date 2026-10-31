// E2E：Playwright-core + 本机 Chrome，驱动 window.__gameTest 跑完整一局。
// 运行：node tests/e2e/run.mjs
// 覆盖：配置 → 名单 → 两关开奖（号码不重复）→ 终场 → 兑奖清单勾选 → CSV/打印
//       → 刷新恢复 → 非法配置拦截 → 2/20 人布局截图与溢出检查。
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../../scripts/serve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SHOT_DIR = path.join(ROOT, 'preview', 'qa');
const PORT = Number(process.env.E2E_PORT) || 5181;

let passed = 0;
const failures = [];

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function assertEq(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
  }
}

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push({ name, message: err && err.message ? err.message : String(err) });
    console.error(`  ✗ ${name}`);
    console.error(`    ${err && err.stack ? err.stack.split('\n').slice(0, 4).join('\n    ') : err}`);
  }
}

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/** 优先本机 Chrome（channel），失败再尝试 CHROME_PATH 与常见安装位置。 */
async function launchBrowser(chromium) {
  const attempts = [];
  attempts.push({
    label: 'chrome channel',
    run: () => chromium.launch({ channel: 'chrome', headless: true }),
  });
  if (process.env.CHROME_PATH) {
    attempts.push({
      label: `CHROME_PATH=${process.env.CHROME_PATH}`,
      run: () => chromium.launch({ executablePath: process.env.CHROME_PATH, headless: true }),
    });
  }
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  ];
  for (const exe of candidates) {
    if (exe && (await fileExists(exe))) {
      attempts.push({ label: exe, run: () => chromium.launch({ executablePath: exe, headless: true }) });
    }
  }
  const errors = [];
  for (const attempt of attempts) {
    try {
      const browser = await attempt.run();
      console.log(`[e2e] 浏览器启动成功（${attempt.label}）`);
      return browser;
    } catch (err) {
      errors.push(`${attempt.label}: ${err && err.message ? err.message.split('\n')[0] : err}`);
    }
  }
  throw new Error(
    '无法启动 headless Chrome。请确认本机已安装 Chrome，或设置 CHROME_PATH 环境变量。\n' +
      errors.map((e) => '  - ' + e).join('\n')
  );
}

async function waitScreen(page, name, timeout = 10000) {
  await page.waitForFunction(
    (n) => !!window.__gameTest && window.__gameTest.screenName === n,
    name,
    { timeout }
  );
}

async function waitClawAim(page) {
  await page
    .waitForFunction(
      () => {
        const screen = window.__gameTest && window.__gameTest.app && window.__gameTest.app.screen;
        return !!screen && !!screen.claw && screen.claw.phase === 'aim';
      },
      null,
      { timeout: 8000 }
    )
    .catch(() => {
      // 爪子状态因帧率波动可能很快就进入下一阶段；forceWin 不依赖该状态，这里不视为失败
    });
}

async function measureLayout(page) {
  return page.evaluate(() => {
    const frame = document.getElementById('stage-frame');
    const canvas = document.getElementById('stage');
    const rect = frame ? frame.getBoundingClientRect() : { left: 0, top: 0, right: 0, bottom: 0 };
    return {
      innerW: window.innerWidth,
      innerH: window.innerHeight,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      canvasW: canvas ? canvas.width : 0,
      canvasH: canvas ? canvas.height : 0,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
    };
  });
}

function assertNoOverflow(layout, label) {
  assert(layout.canvasW === 640 && layout.canvasH === 360, `${label}：画布应为 640×360`);
  assert(layout.left >= -0.5, `${label}：画面左侧溢出（left=${layout.left}）`);
  assert(layout.top >= -0.5, `${label}：画面顶部溢出（top=${layout.top}）`);
  assert(layout.right <= layout.innerW + 0.5, `${label}：画面右侧溢出（right=${layout.right} > ${layout.innerW}）`);
  assert(layout.bottom <= layout.innerH + 0.5, `${label}：画面底部溢出（bottom=${layout.bottom} > ${layout.innerH}）`);
  assert(layout.scrollW <= layout.innerW + 1, `${label}：页面出现横向滚动`);
  assert(layout.scrollH <= layout.innerH + 1, `${label}：页面出现纵向滚动`);
}

const LEVELS_2 = [
  { id: 'e2e_l1', name: '第一关', prize: '暖心保温杯', winners: 1, difficulty: 'easy' },
  { id: 'e2e_l2', name: '第二关', prize: '无线蓝牙耳机', winners: 1, difficulty: 'normal' },
];

const BASE_CONFIG = {
  schema: 1,
  title: 'E2E 测试年会',
  playerCount: 3,
  allowRepeatWin: false,
  sound: false,
  bgm: false,
  pin: '8888',
  levels: LEVELS_2,
};

async function main() {
  let server = null;
  let browser = null;
  try {
    await fs.mkdir(SHOT_DIR, { recursive: true });

    server = await startServer({ port: PORT });
    const base = server.url;
    console.log(`[e2e] 测试服务器：${base}`);

    let chromium = null;
    try {
      ({ chromium } = await import('playwright-core'));
    } catch {
      console.error('[e2e] 缺少依赖 playwright-core，请先运行 npm install');
      process.exitCode = 1;
      return;
    }
    browser = await launchBrowser(chromium);

    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', (err) => pageErrors.push(err && err.message ? err.message : String(err)));

    const sessionId = { value: '' };

    await check('打开 /?test=1，测试接口就绪并停在首页', async () => {
      await page.goto(`${base}/?test=1`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__gameTest, null, { timeout: 20000 });
      await waitScreen(page, 'home');
    });

    await check('setConfig：3 人 2 关，进入名单页并持久化配置', async () => {
      await page.evaluate((cfg) => window.__gameTest.setConfig(cfg), BASE_CONFIG);
      await waitScreen(page, 'roster');
      const state = await page.evaluate(() => ({
        screen: window.__gameTest.screenName,
        players: window.__gameTest.session.config.playerCount,
        levels: window.__gameTest.session.config.levels.length,
        totalSlots: window.__gameTest.config.levels.reduce((s, lv) => s + lv.winners, 0),
        savedConfig: localStorage.getItem('cnyfudai:config.json'),
        savedResults: localStorage.getItem('cnyfudai:results.json'),
      }));
      assertEq(state.screen, 'roster');
      assertEq(state.players, 3);
      assertEq(state.levels, 2);
      assertEq(state.totalSlots, 2);
      assert(!!state.savedConfig, '配置应写入 localStorage');
      assert(!!state.savedResults, '新对局应写入 localStorage');
      assertEq(JSON.parse(state.savedConfig).playerCount, 3);
      assertEq(JSON.parse(state.savedResults).status, 'playing');
      sessionId.value = JSON.parse(state.savedResults).id;
      await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-roster-3p.png') });
    });

    await check('名单页按空格开始第一关，爪子进入可抓取状态', async () => {
      await page.evaluate(() => window.__gameTest.key('Space'));
      await waitScreen(page, 'play');
      await waitClawAim(page);
      const hud = await page.evaluate(() => ({
        level: window.__gameTest.app.screen.levelIndex,
        remain: window.__gameTest.session.draws.length,
      }));
      assertEq(hud.level, 0);
      assertEq(hud.remain, 0);
    });

    await check('第一关 forceWin：记录 1 条中奖，号码 1–3', async () => {
      await page.evaluate(() => window.__gameTest.forceWin());
      await page.waitForFunction(
        () => !!(window.__gameTest.session && window.__gameTest.session.draws.length === 1),
        null,
        { timeout: 5000 }
      );
      const draw = await page.evaluate(() => window.__gameTest.session.draws[0]);
      assertEq(draw.seq, 1);
      assertEq(draw.levelIndex, 0);
      assertEq(draw.levelName, '第一关');
      assertEq(draw.prize, '暖心保温杯');
      assert(draw.player >= 1 && draw.player <= 3, `中奖号码应在 1–3，实际 ${draw.player}`);
      assert(typeof draw.accuracy === 'number' && draw.accuracy >= 0 && draw.accuracy <= 1, '精度应在 0–1');
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-reveal-level1.png') });
    });

    await check('continue：进入第二关开场页', async () => {
      await page.evaluate(() => window.__gameTest.continue());
      await waitScreen(page, 'intro');
      const intro = await page.evaluate(() => ({
        levelIndex: window.__gameTest.app.screen.levelIndex,
        prize: window.__gameTest.app.screen.level.prize,
      }));
      assertEq(intro.levelIndex, 1);
      assertEq(intro.prize, '无线蓝牙耳机');
    });

    await check('第二关抽取：两人不重复，序号/关卡正确', async () => {
      await page.evaluate(() => window.__gameTest.key('Space'));
      await waitScreen(page, 'play');
      await waitClawAim(page);
      await page.evaluate(() => window.__gameTest.forceWin());
      await page.waitForFunction(
        () => !!(window.__gameTest.session && window.__gameTest.session.draws.length === 2),
        null,
        { timeout: 5000 }
      );
      const draws = await page.evaluate(() => window.__gameTest.session.draws.map((d) => ({
        seq: d.seq,
        levelIndex: d.levelIndex,
        player: d.player,
      })));
      assertEq(draws[1].seq, 2);
      assertEq(draws[1].levelIndex, 1);
      assert(draws[1].player >= 1 && draws[1].player <= 3, '号码应在 1–3');
      assert(draws[0].player !== draws[1].player, '默认不允许重复中奖，两人号码必须不同');
      await page.waitForTimeout(900);
      await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-reveal-level2.png') });
    });

    await check('continue 后进入终场，对局标记 finished', async () => {
      await page.evaluate(() => window.__gameTest.continue());
      await waitScreen(page, 'finale');
      const finale = await page.evaluate(() => ({
        status: window.__gameTest.session.status,
        finishedAt: window.__gameTest.session.finishedAt,
        summary: window.__gameTest.summary,
      }));
      assertEq(finale.status, 'finished');
      assert(!!finale.finishedAt, '应有结束时间');
      assertEq(finale.summary.totalWinners, 2);
      assertEq(finale.summary.totalSlots, 2);
      assertEq(finale.summary.paidCount, 0);
      assertEq(finale.summary.remaining, 1);
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-finale.png') });
    });

    await check('openSheet：兑奖清单 2 行，初始未兑付', async () => {
      await page.evaluate(() => window.__gameTest.openSheet());
      await page.waitForSelector('.sheet-backdrop .sheet', { timeout: 5000 });
      const sheet = await page.evaluate(() => ({
        rows: document.querySelectorAll('.sheet tbody tr').length,
        meta: (document.querySelector('.sheet [data-meta]') || {}).textContent || '',
        statuses: [...document.querySelectorAll('.sheet tbody tr td:nth-child(6)')].map(
          (td) => td.textContent
        ),
      }));
      assertEq(sheet.rows, 2);
      assert(sheet.meta.includes('2 人中奖'), `清单标题应显示 2 人中奖，实际：${sheet.meta}`);
      assert(sheet.meta.includes('已兑付 0 人'), `初始应 0 人已兑付，实际：${sheet.meta}`);
      assert(sheet.statuses.every((s) => s === '待兑付'), '初始状态应全部待兑付');
      await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-sheet.png') });
    });

    await check('勾选兑付后持久化，清单状态同步', async () => {
      await page.locator('.sheet tbody input[type="checkbox"]').first().check();
      await page.waitForFunction(
        () => {
          const raw = localStorage.getItem('cnyfudai:results.json');
          if (!raw) return false;
          try {
            const saved = JSON.parse(raw);
            return Array.isArray(saved.draws) && saved.draws.filter((d) => d.paid).length === 1;
          } catch {
            return false;
          }
        },
        null,
        { timeout: 5000 }
      );
      await page.waitForFunction(
        () => ((document.querySelector('.sheet [data-meta]') || {}).textContent || '').includes('已兑付 1 人'),
        null,
        { timeout: 5000 }
      );
      const state = await page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('cnyfudai:results.json'));
        return {
          savedPaid: saved.draws.filter((d) => d.paid).length,
          memoryPaid: window.__gameTest.session.draws.filter((d) => d.paid).length,
          firstStatus: document.querySelector('.sheet tbody tr td:nth-child(6)').textContent,
          checked: document.querySelector('.sheet tbody input[type="checkbox"]').checked,
        };
      });
      assertEq(state.savedPaid, 1);
      assertEq(state.memoryPaid, 1);
      assertEq(state.firstStatus, '已兑付');
      assertEq(state.checked, true);
      assertEq(sessionId.value, await page.evaluate(() => window.__gameTest.session.id));
    });

    await check('CSV：BOM + 表头 + 奖品/号码/兑付状态', async () => {
      const data = await page.evaluate(async () => {
        const report = await import('/js/core/report.js');
        const session = window.__gameTest.session;
        return {
          csv: report.buildCSV(session),
          print: report.buildPrintHTML(session, { printedAt: new Date('2026-01-01T08:00:00Z') }),
          winners: session.draws.map((d) => d.player),
        };
      });
      assert(data.csv.charCodeAt(0) === 0xfeff, 'CSV 应以 UTF-8 BOM 开头');
      assert(
        data.csv.slice(1).startsWith('序号,关卡,奖品,中奖号码,难度,抽取时间,兑付状态'),
        'CSV 表头不正确'
      );
      assert(data.csv.includes('第一关') && data.csv.includes('第二关'), 'CSV 应包含关卡名');
      assert(data.csv.includes('暖心保温杯') && data.csv.includes('无线蓝牙耳机'), 'CSV 应包含奖品');
      assert(data.csv.includes('已兑付') && data.csv.includes('未兑付'), 'CSV 应包含兑付状态');
      assert(data.csv.includes('\r\n'), 'CSV 应使用 CRLF');
      for (const n of data.winners) {
        assert(data.csv.includes(`"${n}"`) || data.csv.includes(`,${n},`), `CSV 应包含号码 ${n}`);
        assert(data.print.includes(`<td class="num">${n} 号</td>`), `打印单应包含号码 ${n}`);
      }
      assert(data.print.includes('兑奖清单'), '打印单应包含标题');
      assert(data.print.includes('暖心保温杯') && data.print.includes('无线蓝牙耳机'), '打印单应包含奖品');
      assert(data.print.includes('✓'), '打印单应包含已兑付勾选');
    });

    await check('刷新页面后 session 仍在、状态与兑付记录正确', async () => {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => !!window.__gameTest, null, { timeout: 20000 });
      await waitScreen(page, 'home');
      const restored = await page.evaluate(() => ({
        id: window.__gameTest.session && window.__gameTest.session.id,
        status: window.__gameTest.session && window.__gameTest.session.status,
        draws: window.__gameTest.session ? window.__gameTest.session.draws.length : 0,
        paid: window.__gameTest.session ? window.__gameTest.session.draws.filter((d) => d.paid).length : 0,
        players: window.__gameTest.config.playerCount,
        screen: window.__gameTest.screenName,
      }));
      assertEq(restored.id, sessionId.value);
      assertEq(restored.status, 'finished');
      assertEq(restored.draws, 2);
      assertEq(restored.paid, 1);
      assertEq(restored.players, 3);
      assertEq(restored.screen, 'home');
    });

    await check('非法配置（名额合计 5 > 3 人）：startNewGame 被拦截且提示错误', async () => {
      const before = await page.evaluate(() => ({
        id: window.__gameTest.session && window.__gameTest.session.id,
        draws: window.__gameTest.session ? window.__gameTest.session.draws.length : 0,
        screen: window.__gameTest.screenName,
      }));
      const invalid = {
        ...BASE_CONFIG,
        levels: [
          { id: 'bad_1', name: '第一关', prize: '保温杯', winners: 3, difficulty: 'easy' },
          { id: 'bad_2', name: '第二关', prize: '耳机', winners: 2, difficulty: 'normal' },
        ],
      };
      await page.evaluate(async (cfg) => {
        window.__gameTest.app.config = cfg;
        await window.__gameTest.startNewGame();
      }, invalid);
      await page.waitForFunction(
        () => {
          const el = document.querySelector('#toast-root .toast.error');
          return !!el && /超过玩家总数/.test(el.textContent || '');
        },
        null,
        { timeout: 5000 }
      );
      const after = await page.evaluate(() => ({
        id: window.__gameTest.session && window.__gameTest.session.id,
        draws: window.__gameTest.session ? window.__gameTest.session.draws.length : 0,
        screen: window.__gameTest.screenName,
        toast: (document.querySelector('#toast-root .toast.error') || {}).textContent || '',
      }));
      assertEq(after.id, before.id, '非法配置不应覆盖现有对局');
      assertEq(after.draws, before.draws);
      assertEq(after.screen, before.screen);
      assert(/超过玩家总数/.test(after.toast), `错误提示应说明名额超限，实际：${after.toast}`);
      await page.screenshot({ path: path.join(SHOT_DIR, 'e2e-invalid-config.png') });
    });

    await check('2 人配置：首页/名单页无溢出并截图', async () => {
      const cfg2 = { ...BASE_CONFIG, title: '2 人测试', playerCount: 2 };
      await page.evaluate((cfg) => window.__gameTest.setConfig(cfg), cfg2);
      await waitScreen(page, 'roster');
      await page.waitForTimeout(400);
      assertNoOverflow(await measureLayout(page), '名单页（2 人）');
      await page.screenshot({ path: path.join(SHOT_DIR, 'roster-2p.png') });
      await page.evaluate(() => window.__gameTest.openHome());
      await waitScreen(page, 'home');
      await page.waitForTimeout(400);
      assertNoOverflow(await measureLayout(page), '首页（2 人）');
      await page.screenshot({ path: path.join(SHOT_DIR, 'home-2p.png') });
    });

    await check('20 人配置：首页/名单页无溢出并截图', async () => {
      const cfg20 = {
        ...BASE_CONFIG,
        title: '20 人测试',
        playerCount: 20,
        levels: [
          { id: 'l1', name: '第一关', prize: '保温杯', winners: 3, difficulty: 'easy' },
          { id: 'l2', name: '第二关', prize: '蓝牙耳机', winners: 2, difficulty: 'normal' },
          { id: 'l3', name: '第三关', prize: '智能手表', winners: 1, difficulty: 'hard' },
          { id: 'l4', name: '特等奖', prize: '神秘大奖', winners: 1, difficulty: 'extreme' },
        ],
      };
      await page.evaluate((cfg) => window.__gameTest.setConfig(cfg), cfg20);
      await waitScreen(page, 'roster');
      await page.waitForTimeout(400);
      assertNoOverflow(await measureLayout(page), '名单页（20 人）');
      await page.screenshot({ path: path.join(SHOT_DIR, 'roster-20p.png') });
      await page.evaluate(() => window.__gameTest.openHome());
      await waitScreen(page, 'home');
      await page.waitForTimeout(400);
      assertNoOverflow(await measureLayout(page), '首页（20 人）');
      await page.screenshot({ path: path.join(SHOT_DIR, 'home-20p.png') });
    });

    if (pageErrors.length) {
      console.warn(`[e2e] 页面脚本错误 ${pageErrors.length} 条：`);
      for (const msg of pageErrors.slice(0, 10)) console.warn('  - ' + msg);
    }
  } catch (err) {
    failures.push({ name: 'E2E 初始化', message: err && err.message ? err.message : String(err) });
    console.error('[e2e] 致命错误：', err);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
  }

  console.log('');
  console.log('================ E2E 结果 ================');
  console.log(`通过：${passed} 项`);
  console.log(`失败：${failures.length} 项`);
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f.name}：${f.message}`);
    console.log('==========================================');
    process.exitCode = 1;
  } else {
    console.log('全部通过 🎉');
    console.log(`截图目录：${path.relative(ROOT, SHOT_DIR)}`);
    console.log('==========================================');
    process.exitCode = 0;
  }
}

await main();
