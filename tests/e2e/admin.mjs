// 后台管理 E2E 冒烟：PIN 门禁（含错误 5 次锁定）→ 四页签 → 关卡增删/名额超限
// → 改标题保存 → 非法标题拦截 → reload 后仍是新标题 → 960 窄窗口
// → 中奖记录勾选兑付/导出 CSV → 重置本局 → 恢复默认设置。
// 运行：node tests/e2e/admin.mjs（需要 npm install 与本机 Chrome）
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { startServer } from '../../scripts/serve.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SHOT_DIR = path.join(ROOT, 'preview', 'qa');
const PORT = Number(process.env.E2E_ADMIN_PORT) || 5183;
const DEFAULT_TITLE = '新春福袋抓抓乐';
const TEST_TITLE = '后台冒烟测试标题';

let passed = 0;
const failures = [];
const pageErrors = [];

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

async function launchBrowser(chromium) {
  const attempts = [{ label: 'chrome channel', run: () => chromium.launch({ channel: 'chrome', headless: true }) }];
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
      return await attempt.run();
    } catch (err) {
      errors.push(`${attempt.label}: ${(err && err.message ? err.message : String(err)).split('\n')[0]}`);
    }
  }
  throw new Error('无法启动 headless Chrome：\n' + errors.map((e) => '  - ' + e).join('\n'));
}

function watchPage(page) {
  page.on('pageerror', (err) =>
    pageErrors.push('pageerror: ' + (err && err.message ? err.message : String(err)))
  );
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    // 忽略浏览器自动请求 favicon / 静态资源 404 的噪音
    if (/favicon|Failed to load resource|404 \(Not Found\)/.test(text)) return;
    pageErrors.push('console.error: ' + text);
  });
}

async function waitTestApi(page) {
  await page.waitForFunction(() => !!window.__gameTest, null, { timeout: 20000 });
}

async function waitScreen(page, name) {
  await page.waitForFunction(
    (n) => !!window.__gameTest && window.__gameTest.screenName === n,
    name,
    { timeout: 10000 }
  );
}

async function waitToast(page, text, timeout = 5000) {
  await page.waitForFunction(
    (t) =>
      [...document.querySelectorAll('#toast-root .toast')].some((el) =>
        (el.textContent || '').includes(t)
      ),
    text,
    { timeout }
  );
}

/** 打开后台（不 await，openAdmin 会等到关闭才 resolve），输入 8888 解锁。 */
async function unlockAdmin(page) {
  await page.evaluate(() => {
    window.__gameTest.openAdmin();
  });
  await page.waitForSelector('.admin-gate-card', { timeout: 8000 });
  await page.fill('.admin-pin-input', '8888');
  await page.press('.admin-pin-input', 'Enter');
  await page.waitForSelector('.admin-panel', { timeout: 8000 });
  await page.waitForTimeout(300);
}

async function main() {
  let server = null;
  let browser = null;
  try {
    await fs.mkdir(SHOT_DIR, { recursive: true });
    server = await startServer({ port: PORT });
    const base = server.url;
    console.log(`[e2e-admin] 测试服务器：${base}`);

    let chromium = null;
    try {
      ({ chromium } = await import('playwright-core'));
    } catch {
      console.error('[e2e-admin] 缺少依赖 playwright-core，请先运行 npm install');
      process.exitCode = 1;
      return;
    }
    browser = await launchBrowser(chromium);

    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    watchPage(page);

    await check('首页 → 打开后台 → PIN 门禁（默认 8888）解锁', async () => {
      await page.goto(`${base}/?test=1`, { waitUntil: 'domcontentloaded' });
      await waitTestApi(page);
      await page.evaluate(() => {
        window.__gameTest.openAdmin();
      });
      await page.waitForSelector('.admin-gate-card', { timeout: 8000 });
      const gate = await page.evaluate(() => ({
        rootOpen: !!document.querySelector('.admin-root.open'),
        card: !!document.querySelector('.admin-gate-card'),
        input: !!document.querySelector('.admin-pin-input'),
      }));
      assert(gate.rootOpen && gate.card && gate.input, 'PIN 门禁元素不完整');
      await page.fill('.admin-pin-input', '8888');
      await page.press('.admin-pin-input', 'Enter');
      await page.waitForSelector('.admin-panel', { timeout: 8000 });
      const panel = await page.evaluate(() => ({
        tabs: [...document.querySelectorAll('.admin-tab')].map((b) => b.textContent.trim()),
        meta: (document.querySelector('.admin-panel [data-meta]') || {}).textContent || '',
      }));
      assert(panel.tabs.length === 4, `应有 4 个页签，实际 ${panel.tabs.length}`);
      assert(panel.meta.includes('位玩家'), `面板顶部应显示配置摘要，实际：${panel.meta}`);
      await page.screenshot({ path: path.join(SHOT_DIR, 'admin-e2e-panel.png') });
    });

    await check('四个页签可切换且内容渲染', async () => {
      const expected = {
        levels: '.adm-slotbar',
        records: '.adm-empty',
        settings: '#adm-title',
        data: '.adm-card',
      };
      for (const [tab, selector] of Object.entries(expected)) {
        await page.click(`.admin-tab[data-tab="${tab}"]`);
        await page.waitForSelector(selector, { timeout: 5000 });
        const ok = await page.evaluate(
          (sel) => !!document.querySelector('.admin-body ' + sel) || !!document.querySelector(sel),
          selector
        );
        assert(ok, `页签 ${tab} 未渲染 ${selector}`);
        await page.screenshot({ path: path.join(SHOT_DIR, `admin-e2e-tab-${tab}.png`) });
      }
      // 关卡页签显示名额条
      await page.click('.admin-tab[data-tab="levels"]');
      await page.waitForSelector('.adm-slotbar', { timeout: 5000 });
    });

    await check('关卡与奖品：新增 / 上移 / 删除 / 名额超限禁用保存', async () => {
      await page.click('.admin-tab[data-tab="levels"]');
      await page.waitForSelector('.adm-level', { timeout: 5000 });
      assertEq(
        await page.$$eval('.adm-level', (els) => els.length),
        4,
        '默认应有 4 关'
      );

      // 新增一关
      await page.click('[data-act="add"]');
      await page.waitForFunction(() => document.querySelectorAll('.adm-level').length === 5, null, {
        timeout: 5000,
      });
      const newName = await page.inputValue('.adm-level[data-index="4"] input[data-field="name"]');
      assertEq(newName, '第5关', '新增关卡名称');

      // 上移：第 5 关应换到第 4 位
      await page.click('.adm-level[data-index="4"] [data-act="up"]');
      await page.waitForFunction(
        () => (document.querySelectorAll('.adm-level input[data-field="name"]')[3] || {}).value === '第5关',
        null,
        { timeout: 5000 }
      );

      // 删除现在的第 5 张卡（特等奖），需在确认框点“删除”
      await page.click('.adm-level[data-index="4"] [data-act="del"]');
      await page.waitForSelector('.modal-backdrop .modal', { timeout: 5000 });
      await page.click('.modal-backdrop [data-ok]');
      await page.waitForFunction(() => document.querySelectorAll('.adm-level').length === 4, null, {
        timeout: 5000,
      });

      // 名额超限：第 1 关改成 9 人，合计 13 > 12，保存按钮应禁用、名额条变红
      await page.fill('.adm-level[data-index="0"] input[data-field="winners"]', '9');
      await page.waitForFunction(
        () => {
          const save = document.querySelector('[data-act="save"]');
          const bar = document.querySelector('.adm-slotbar');
          return !!save && save.disabled && !!bar && bar.classList.contains('over');
        },
        null,
        { timeout: 5000 }
      );
      const overHint = await page.textContent('.adm-slotbar [data-slot-hint]');
      assert(/超出/.test(overHint), `名额条应提示超出，实际：${overHint}`);

      // 改回 3，保存恢复可用；再放弃全部草稿修改
      await page.fill('.adm-level[data-index="0"] input[data-field="winners"]', '3');
      await page.waitForFunction(
        () => {
          const save = document.querySelector('[data-act="save"]');
          const bar = document.querySelector('.adm-slotbar');
          return !!save && !save.disabled && !!bar && !bar.classList.contains('over');
        },
        null,
        { timeout: 5000 }
      );
      await page.click('[data-act="cancel"]');
      await waitToast(page, '已放弃未保存的修改');
      const restored = await page.evaluate(
        () => window.__gameTest.config.levels.map((lv) => lv.name).join(',')
      );
      assertEq(restored, '第一关,第二关,第三关,特等奖', '放弃修改应还原已保存关卡');
    });

    await check('基础设置修改标题并保存，写入持久化', async () => {
      await page.click('.admin-tab[data-tab="settings"]');
      await page.waitForSelector('#adm-title', { timeout: 5000 });
      await page.fill('#adm-title', TEST_TITLE);
      await page.click('[data-act="save"]');
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('#toast-root .toast')].some((t) =>
            (t.textContent || '').includes('设置已保存')
          ),
        null,
        { timeout: 5000 }
      );
      const saved = await page.evaluate(() => {
        const raw = localStorage.getItem('cnyfudai:config.json');
        return {
          savedTitle: raw ? JSON.parse(raw).title : null,
          memoryTitle: window.__gameTest.config.title,
          meta: (document.querySelector('.admin-panel [data-meta]') || {}).textContent || '',
        };
      });
      assert(saved.savedTitle === TEST_TITLE, `config.json 标题应为 ${TEST_TITLE}，实际 ${saved.savedTitle}`);
      assert(saved.memoryTitle === TEST_TITLE, `内存配置标题应为 ${TEST_TITLE}，实际 ${saved.memoryTitle}`);
      assert(saved.meta.includes(TEST_TITLE), `面板摘要应显示新标题，实际：${saved.meta}`);
    });

    await check('关闭后台并刷新页面，标题仍为保存值', async () => {
      await page.click('.admin-panel [data-act="close"]');
      await page.waitForFunction(
        () => !document.querySelector('.admin-panel') && !document.querySelector('.admin-root.open'),
        null,
        { timeout: 5000 }
      );
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitTestApi(page);
      const afterReload = await page.evaluate(() => window.__gameTest.config.title);
      assert(afterReload === TEST_TITLE, `刷新后配置标题应为 ${TEST_TITLE}，实际 ${afterReload}`);

      await unlockAdmin(page);
      const titleInput = await page.inputValue('#adm-title');
      assert(titleInput === TEST_TITLE, `后台标题输入框应为 ${TEST_TITLE}，实际 ${titleInput}`);
      await page.screenshot({ path: path.join(SHOT_DIR, 'admin-after-reload.png') });
    });

    await check('非法标题（清空）保存被拦截：提示错误且不写入 localStorage', async () => {
      await page.click('.admin-tab[data-tab="settings"]');
      await page.waitForSelector('#adm-title', { timeout: 5000 });
      await page.fill('#adm-title', '');
      assertEq(await page.inputValue('#adm-title'), '', '标题应被清空');
      await page.click('[data-act="save"]');
      await waitToast(page, '不能为空');
      const state = await page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('cnyfudai:config.json'));
        const errEl = document.querySelector('[data-field-error="title"]');
        const bodyText = (document.querySelector('.admin-body') || {}).textContent || '';
        return {
          savedTitle: saved.title,
          errorText: errEl ? errEl.textContent : '',
          bodyHasError: bodyText.includes('游戏标题不能为空'),
        };
      });
      assertEq(state.savedTitle, TEST_TITLE, '非法保存不应覆盖已持久化标题');
      assert(/不能为空/.test(state.errorText), `标题字段下方应显示错误，实际：${state.errorText}`);
      assert(state.bodyHasError, '面板中应出现“游戏标题不能为空”提示');
    });

    await check('恢复默认标题并保存，避免污染后续演示数据', async () => {
      await page.fill('#adm-title', DEFAULT_TITLE);
      await page.click('[data-act="save"]');
      await page.waitForFunction(
        () =>
          [...document.querySelectorAll('#toast-root .toast')].some((t) =>
            (t.textContent || '').includes('设置已保存')
          ),
        null,
        { timeout: 5000 }
      );
      const title = await page.evaluate(() => window.__gameTest.config.title);
      assert(title === DEFAULT_TITLE, '恢复默认标题失败');
      await page.click('.admin-panel [data-act="close"]');
    });

    await check('960×540 窄窗口：后台面板不溢出、内容可滚动', async () => {
      const narrow = await browser.newContext({ viewport: { width: 960, height: 540 } });
      const p2 = await narrow.newPage();
      watchPage(p2);
      await p2.goto(`${base}/?test=1`, { waitUntil: 'domcontentloaded' });
      await waitTestApi(p2);
      await unlockAdmin(p2);
      await p2.click('.admin-tab[data-tab="levels"]');
      await p2.waitForSelector('.adm-slotbar', { timeout: 5000 });
      const info = await p2.evaluate(() => {
        const panel = document.querySelector('.admin-panel');
        const body = document.querySelector('.admin-body');
        const rect = panel.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          bottom: rect.bottom,
          innerW: window.innerWidth,
          innerH: window.innerHeight,
          docScrollW: document.documentElement.scrollWidth,
          bodyOverflowY: getComputedStyle(body).overflowY,
          panelOverflowX: panel.scrollWidth > panel.clientWidth + 1,
        };
      });
      assert(info.left >= -0.5 && info.right <= info.innerW + 0.5, '后台面板横向越界');
      assert(info.bottom <= info.innerH + 0.5, '后台面板纵向越界');
      assert(info.docScrollW <= info.innerW + 1, '窄窗口出现页面横向滚动');
      assert(info.bodyOverflowY === 'auto', `.admin-body 应为 auto 滚动，实际 ${info.bodyOverflowY}`);
      assert(!info.panelOverflowX, '后台面板内部横向溢出');
      await p2.screenshot({ path: path.join(SHOT_DIR, 'admin-e2e-panel-960.png') });
      await narrow.close();
    });

    await check('错误 PIN 连续 5 次：锁定 10 秒，期间输入/键盘禁用，之后恢复', async () => {
      const pinCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      try {
        const p = await pinCtx.newPage();
        watchPage(p);
        await p.goto(`${base}/?test=1`, { waitUntil: 'domcontentloaded' });
        await waitTestApi(p);
        await p.evaluate(() => {
          window.__gameTest.openAdmin();
        });
        await p.waitForSelector('.admin-gate-card', { timeout: 8000 });

        for (let i = 0; i < 5; i++) {
          await p.fill('.admin-pin-input', '1111');
          await p.waitForTimeout(320);
        }

        await p.waitForFunction(
          () => {
            const input = document.querySelector('.admin-pin-input');
            const hint = document.querySelector('.admin-gate-hint');
            return !!input && input.disabled && !!hint && /锁定|秒后再试/.test(hint.textContent || '');
          },
          null,
          { timeout: 5000 }
        );
        const locked = await p.evaluate(() => {
          const input = document.querySelector('.admin-pin-input');
          const keypad = [...document.querySelectorAll('.admin-key')];
          return {
            inputDisabled: input.disabled,
            disabledKeys: keypad.filter((b) => b.disabled).length,
            keyCount: keypad.length,
            hint: (document.querySelector('.admin-gate-hint') || {}).textContent || '',
            error: (document.querySelector('.admin-gate-error') || {}).textContent || '',
          };
        });
        assert(locked.inputDisabled, '锁定期间密码输入框应禁用');
        assertEq(locked.disabledKeys, locked.keyCount, '锁定期间数字键盘应全部禁用');
        assert(/锁定|秒后再试/.test(locked.hint), `应提示锁定倒计时，实际：${locked.hint}`);

        // 10 秒后自动解锁（轮询等待，避免固定 10.5s 的脆弱等待）
        await p.waitForFunction(
          () => {
            const input = document.querySelector('.admin-pin-input');
            const hint = document.querySelector('.admin-gate-hint');
            return (
              !!input &&
              !input.disabled &&
              !!hint &&
              (hint.textContent || '').includes('按 Enter 确认') &&
              (document.querySelector('.admin-gate-error') || {}).textContent === ''
            );
          },
          null,
          { timeout: 13000 }
        );

        // 解锁后输正确密码仍可进入面板，验证锁定没有把门禁锁死
        await p.fill('.admin-pin-input', '8888');
        await p.press('.admin-pin-input', 'Enter');
        await p.waitForSelector('.admin-panel', { timeout: 8000 });
      } finally {
        await pinCtx.close();
      }
    });

    await check('中奖记录：造一局 → 勾选兑付持久化 → 导出 CSV → 重置本局 → 恢复默认', async () => {
      const dataCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
      try {
        const p = await dataCtx.newPage();
        watchPage(p);
        await p.goto(`${base}/?test=1`, { waitUntil: 'domcontentloaded' });
        await waitTestApi(p);

        // 造一局：3 人 2 关各 1 人，第一关中奖 1 人
        await p.evaluate((cfg) => window.__gameTest.setConfig(cfg), {
          schema: 1,
          title: '记录页测试',
          playerCount: 3,
          allowRepeatWin: false,
          sound: false,
          bgm: false,
          pin: '8888',
          levels: [
            { id: 'rec_l1', name: '第一关', prize: '暖心保温杯', winners: 1, difficulty: 'easy' },
            { id: 'rec_l2', name: '第二关', prize: '无线蓝牙耳机', winners: 1, difficulty: 'normal' },
          ],
        });
        await waitScreen(p, 'roster');
        await p.evaluate(() => window.__gameTest.key('Space'));
        await waitScreen(p, 'play');
        await p.evaluate(() => window.__gameTest.forceWin());
        await p.waitForFunction(
          () => !!(window.__gameTest.session && window.__gameTest.session.draws.length === 1),
          null,
          { timeout: 5000 }
        );

        await p.evaluate(() => {
          window.__gameTest.openAdmin();
        });
        await p.waitForSelector('.admin-gate-card', { timeout: 8000 });
        await p.fill('.admin-pin-input', '8888');
        await p.press('.admin-pin-input', 'Enter');
        await p.waitForSelector('.admin-panel', { timeout: 8000 });

        // 中奖记录页签
        await p.click('.admin-tab[data-tab="records"]');
        await p.waitForSelector('.adm-stats', { timeout: 5000 });
        const groups = await p.$$eval('.adm-group', (els) => els.length);
        assert(groups >= 2, `中奖记录应按关卡分组，实际 ${groups} 组`);
        const checkboxCount = await p.$$eval('.adm-group input[type="checkbox"]', (els) => els.length);
        assertEq(checkboxCount, 1, '应只有 1 条中奖记录');

        // 勾选兑付 → 持久化
        await p.check('.adm-group input[type="checkbox"]');
        await p.waitForFunction(
          () => {
            try {
              const saved = JSON.parse(localStorage.getItem('cnyfudai:results.json'));
              return Array.isArray(saved.draws) && saved.draws.some((d) => d.paid);
            } catch {
              return false;
            }
          },
          null,
          { timeout: 5000 }
        );

        // 导出 CSV（浏览器模式触发下载）
        const downloadPromise = p.waitForEvent('download', { timeout: 10000 });
        await p.click('[data-act="csv"]');
        const download = await downloadPromise;
        assert(/兑奖清单/.test(download.suggestedFilename()), `CSV 文件名应含“兑奖清单”，实际 ${download.suggestedFilename()}`);
        const filePath = await download.path();
        const csv = await fs.readFile(filePath, 'utf8');
        assert(csv.charCodeAt(0) === 0xfeff, 'CSV 应以 UTF-8 BOM 开头');
        assert(
          csv.slice(1).startsWith('序号,关卡,奖品,中奖号码,难度,抽取时间,兑付状态'),
          'CSV 表头不正确'
        );
        assert(csv.includes('暖心保温杯'), 'CSV 应包含奖品名称');
        assert(csv.includes('已兑付'), 'CSV 应包含兑付状态');

        // 数据管理：重置本局
        await p.click('.admin-tab[data-tab="data"]');
        await p.waitForSelector('[data-act="reset-session"]', { timeout: 5000 });
        assert(!(await p.isDisabled('[data-act="reset-session"]')), '有对局时“重置本局”应可用');
        await p.click('[data-act="reset-session"]');
        await p.waitForSelector('.modal-backdrop .modal', { timeout: 5000 });
        await p.click('.modal-backdrop [data-ok]');
        await waitToast(p, '本局记录已重置');
        await p.click('.admin-tab[data-tab="records"]');
        await p.waitForSelector('.adm-empty', { timeout: 5000 });

        // 数据管理：恢复默认设置（双重确认）
        await p.click('.admin-tab[data-tab="data"]');
        await p.waitForSelector('[data-act="restore-default"]', { timeout: 5000 });
        await p.click('[data-act="restore-default"]');
        await p.waitForSelector('.modal-backdrop .modal', { timeout: 5000 });
        await p.click('.modal-backdrop [data-ok]');
        await p.waitForFunction(
          () => {
            const modal = document.querySelector('.modal-backdrop .modal');
            return !!modal && (modal.textContent || '').includes('再次确认');
          },
          null,
          { timeout: 5000 }
        );
        await p.click('.modal-backdrop [data-ok]');
        await waitToast(p, '已恢复默认设置');
        const after = await p.evaluate(() => {
          const cfg = JSON.parse(localStorage.getItem('cnyfudai:config.json'));
          let results = 'missing';
          try {
            results = JSON.parse(localStorage.getItem('cnyfudai:results.json'));
          } catch {
            results = 'broken';
          }
          return { title: cfg.title, playerCount: cfg.playerCount, pin: cfg.pin, results };
        });
        assertEq(after.title, '新春福袋抓抓乐', '恢复默认后标题');
        assertEq(after.playerCount, 12, '恢复默认后人数');
        assertEq(after.pin, '8888', '恢复默认后密码');
        assertEq(after.results, null, '恢复默认后应清空当前对局');
      } finally {
        await dataCtx.close();
      }
    });

    if (pageErrors.length) {
      console.warn(`[e2e-admin] 页面错误 ${pageErrors.length} 条：`);
      for (const msg of pageErrors.slice(0, 10)) console.warn('  - ' + msg);
      failures.push({ name: '页面 console/pageerror', message: pageErrors.slice(0, 5).join(' | ') });
    }
  } catch (err) {
    failures.push({ name: 'E2E-Admin 初始化', message: err && err.message ? err.message : String(err) });
    console.error('[e2e-admin] 致命错误：', err);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) await server.close().catch(() => {});
  }

  console.log('');
  console.log('============ 后台 E2E 结果 ============');
  console.log(`通过：${passed} 项，失败：${failures.length} 项`);
  if (failures.length) {
    for (const f of failures) console.log(`  ✗ ${f.name}：${f.message}`);
    console.log('=======================================');
    process.exitCode = 1;
  } else {
    console.log('全部通过 🎉');
    console.log('=======================================');
    process.exitCode = 0;
  }
}

await main();
